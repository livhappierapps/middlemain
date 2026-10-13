// This entire function is serialized as trusted worker code. Repository contents
// are passed only as data, never interpolated into or evaluated as worker code.
export function repositoryPreflightWorker(data: any, loadTrusted: NodeRequire) {
  const { parentPort } = loadTrusted("node:worker_threads");
  const ts = loadTrusted(data.compilerPath);
  const fs = loadTrusted("node:fs");
  const path = loadTrusted("node:path");
  const input = data.snapshot;
  const report = data.report;
  const files = new Map<string, string>(input.files.map((f: any) => [`/repo/${f.path}`, f.content]));
  const manifests: any[] = [];
  const declared = new Set<string>();
  const workspacePackages = new Set<string>();
  const aliases: string[] = [];
  let customBaseUrl = false;
  const findings: Record<string, any[]> = report.findings;
  let capped = false;
  const add = (category: string, finding: any) => {
    if (Object.values(findings).reduce((n: number, entries: any) => n + entries.length, 0) >= 120) { capped = true; return; }
    findings[category].push(finding);
  };
  const native = (message: string) => add("native", { severity: "info", code: "NOT_RUN", message });
  for (const f of input.files) {
    if (!f.path.endsWith(".json")) continue;
    const config = /(^|\/)(?:tsconfig|jsconfig)[^/]*\.json$/.test(f.path);
    try {
      const parsed = config ? ts.parseConfigFileTextToJson(f.path, f.content) : { config: JSON.parse(f.content) };
      if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
      const json = parsed.config;
      if (f.path.endsWith("package.json")) {
        manifests.push({ path: f.path, json });
        if (typeof json?.name === "string") workspacePackages.add(json.name);
        for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          for (const name of Object.keys(json?.[key] ?? {})) declared.add(name);
        }
      }
      if (config && (json?.extends || json?.compilerOptions?.plugins)) {
        add("configuration", { path: f.path, severity: "warning", code: "CONFIG_NOT_EXECUTED", message: "External config inheritance and compiler plugins are ignored. This check uses safe compiler options, not the complete project configuration." });
      }
      if (config && (json?.compilerOptions?.paths || json?.compilerOptions?.baseUrl)) {
        aliases.push(...Object.keys(json?.compilerOptions?.paths ?? {}).slice(0, 200));
        customBaseUrl ||= !!json?.compilerOptions?.baseUrl;
        add("configuration", { path: f.path, severity: "warning", code: "ALIASES_UNVERIFIED", message: "Project path aliases/baseUrl are not applied. Matching unresolved imports are inconclusive in this safe source snapshot." });
      }
      if (f.path.endsWith("eas.json") && !json?.build) {
        add("configuration", { path: f.path, severity: "warning", code: "EAS_PROFILES", message: "No build profiles were found. A native build was not attempted." });
      }
    } catch {
      add("configuration", { path: f.path, severity: "error", code: "JSON_SYNTAX", message: "Invalid JSON/JSONC configuration syntax." });
    }
  }
  if (!manifests.length) add("configuration", { severity: "warning", code: "MANIFEST_MISSING", message: "No package.json was included; dependency declaration checks are inconclusive." });
  if (!input.observedPaths.some((p: string) => /(^|\/)(pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?)$/.test(p))) {
    add("configuration", { severity: "warning", code: "LOCKFILE_NOT_OBSERVED", message: "No supported lockfile was observed in the supplied listing. Frozen dependency installation is not verified." });
  }
  native("Native compilation, EAS, signing, device permissions, platform SDKs, and store submission were not run.");
  native("Dependency installation/versions, repository scripts, native plugins, and lockfile consistency were not verified.");
  native("Unsupported languages and binary assets are outside this JS/TS/config source check.");
  parentPort.postMessage({ progress: report });

  const options = {
    noEmit: true, allowJs: true, checkJs: true, strict: false, noUncheckedSideEffectImports: true,
    skipLibCheck: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    resolveJsonModule: true, esModuleInterop: true, types: [],
    baseUrl: "/repo",
  };
  const libDir = path.dirname(ts.getDefaultLibFilePath(options));
  // Never delegate repository-controlled paths to the real filesystem.
  const trustedLib = (p: string) => path.dirname(p) === libDir && /^lib(?:\.[a-z0-9.-]+)?\.d\.ts$/i.test(path.basename(p));
  const read = (p: string) => files.get(p) ?? (trustedLib(p) ? fs.readFileSync(p, "utf8") : undefined);
  const host = {
    getSourceFile: (p: string, version: any) => {
      const text = read(p);
      return text === undefined ? undefined : ts.createSourceFile(p, text, version, true);
    },
    getDefaultLibFileName: () => ts.getDefaultLibFilePath(options),
    writeFile: () => { throw new Error("Emission is disabled"); },
    getCurrentDirectory: () => "/repo",
    getDirectories: () => [],
    fileExists: (p: string) => files.has(p) || (trustedLib(p) && fs.existsSync(p)),
    readFile: read,
    directoryExists: (p: string) => p === libDir || [...files.keys()].some(f => f.startsWith(p.replace(/\/$/, "") + "/")),
    realpath: (p: string) => p,
    getCanonicalFileName: (p: string) => p,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const roots = [...files.keys()].filter(p => /\.(?:[cm]?[jt]sx?)$/i.test(p));
  const diagnostics = roots.length ? ts.getPreEmitDiagnostics(ts.createProgram(roots, options, host)) : [];
  const seenModules = new Set<string>();
  for (const d of diagnostics) {
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n").slice(0, 1000);
    const p = d.file?.fileName.startsWith("/repo/") ? d.file.fileName.slice(6) : undefined;
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
    const finding: any = { path: p, line: pos ? pos.line + 1 : undefined, col: pos ? pos.character + 1 : undefined, severity: "error", code: `TS${d.code}`, message };
    if ([2307, 2792, 7016].includes(d.code)) {
      const module = message.match(/module ['"]([^'"]+)['"]/)?.[1] ?? "unknown module";
      const key = `${p}:${module}`;
      if (seenModules.has(key)) continue;
      seenModules.add(key);
      const internal = module.startsWith(".") || module.startsWith("/") || module.startsWith("@/");
      const pkg = module.startsWith("@") ? module.split("/").slice(0, 2).join("/") : module.split("/")[0];
      const declaredPackage = declared.has(pkg) || workspacePackages.has(pkg);
      const builtin = module.startsWith("node:") || loadTrusted("node:module").builtinModules.includes(module);
      const alias = module.startsWith("@/") || (!internal && customBaseUrl) || aliases.some(a => {
        const star = a.indexOf("*");
        return star < 0 ? module === a : module.startsWith(a.slice(0, star)) && module.endsWith(a.slice(star + 1));
      });
      finding.severity = input.partial || alias || declaredPackage || builtin || !manifests.length || /\.(png|jpe?g|svg|webp|css)$/.test(module) ? "warning" : "error";
      finding.message = internal
        ? `Import ${module} could not be resolved in the supplied source snapshot. Aliases, excluded assets, and omitted files may require the project's real build configuration.`
        : declaredPackage || builtin
          ? `${module} is declared or built-in, but its installed dependencies/typings are not loaded by this isolated preflight. This is not proof it is missing from your installed project.`
          : `${module} was not found in the supplied package manifests or snapshot. Check its declaration and installation; omitted manifests may make this inconclusive.`;
      add("dependencies", finding);
    } else {
      // Absent ambient/platform types cannot prove an application source error.
      if ([2503, 2580, 2688, 2875].includes(d.code)) finding.severity = "warning";
      add("syntaxTypes", finding);
    }
  }
  report.partial ||= capped;
  if (capped) findings.configuration.push({ severity: "warning", code: "OUTPUT_LIMIT", message: "Finding output was capped; this report is partial." });
  report.coverage.checkedSourceFiles = roots.length;
  parentPort.postMessage({ result: report });
}
