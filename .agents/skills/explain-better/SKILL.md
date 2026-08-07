---
name: explain-better
description: Give the user clear, simple, step-by-step instructions for anything she needs to do manually. Activate when the user needs to take action outside the agent (e.g. open an app, tap a button, visit a URL, accept a build, install something, enter a code). Also activate when the user says "explain better", "walk me through it", "I don't get it", "what do I do", "how do I do that", "ELI5", or seems confused about next steps. The user manages 4 apps at once while caring for a toddler — she is sharp when focused but gets scattered. Instructions must be short, numbered, concrete, and zero-assumption. No jargon without a plain-English translation.
---

# Explain Better

## Who You're Writing For

The user is smart and capable — when she can focus, she picks things up fast. But she's often managing multiple projects simultaneously while also wrangling a toddler. That means:

- She may not have both hands free
- She may be interrupted mid-step and lose her place
- Long walls of text will get lost
- Jargon without explanation causes confusion, not speed
- She needs to know *exactly* what to tap, type, or open — no guessing

## How to Write Instructions

**Use this format for any multi-step action:**

1. Start each step with a verb. ("Tap", "Open", "Type", "Copy", "Paste", "Wait for")
2. One action per step. Never combine two actions in one bullet.
3. If something has to load or finish before the next step, say so explicitly. ("Wait for the green checkmark, then go to step 4.")
4. Name exactly what the user will see. ("Tap the purple button that says **Accept**" not "accept the task".)
5. If a step is on a specific device or app, say which one upfront. ("On your phone:", "In the Replit app:", "In a browser:")
6. Keep each step to one sentence if possible. Two max.

**Jargon rule:** If you use a technical term, put the plain-English version right after it in parentheses. First time only.
- Good: "EAS (the service that builds your app)"
- Good: "APK (the Android install file)"
- Bad: "Trigger the EAS build pipeline for the preview profile"

**Length rule:** If the full instructions are more than 8 steps, split them into named stages.
- Stage 1: Get the file (steps 1–3)
- Stage 2: Install it (steps 4–6)
- Stage 3: Confirm it worked (steps 7–8)

**Tone:** Friendly and direct. Like a patient friend texting her the steps. No corporate language. No "please ensure that". Just "tap this, then tap that."

## When a Task Involves Waiting

Tell her:
- What to wait for (what she'll see when it's done)
- Roughly how long ("usually 10–15 minutes")
- What to do in the meantime if anything ("you can close this tab — it keeps building in the background")
- What to do when it's ready ("come back here and I'll have the next steps")

## Example

**Bad version:**
"Navigate to the EAS dashboard for your project and locate the completed build artifact, then download the APK using the provided link and sideload it onto your device."

**Good version:**

Here's how to get the app on your phone:

**Stage 1 — Get the download link** (takes 30 seconds)
1. On your phone or computer, open this link: [link]
2. Look for a green button that says **Download**
3. Tap it — the file will start downloading

**Stage 2 — Install it** (takes 1 minute)
4. Open your phone's **Files** app (or Downloads folder)
5. Tap the file called **Middlemain.apk**
6. If it asks "Allow from this source?" — tap **Allow**
7. Tap **Install**
8. Wait for the loading bar to finish, then tap **Open**

Done! The app is installed. ✓
