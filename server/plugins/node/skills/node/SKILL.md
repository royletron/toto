---
name: node
description: Keep notes for next time and put things on the person's to-do list: what to remember about this project, and what to leave for later.
---

# Memory and tasks

This Toto keeps notes for its agents and a list of things to do. Both are on the Toto, and the person reads and changes them in the app.

## Memory

- **At the start** you are shown the titles of what applies to you. Call `recall` with an id when one looks useful for what you are about to do.
- **`remember`** what is worth knowing next time: how something is done here, a command that works, what the person prefers, what went wrong and why. Short and specific, with a title that says when it matters.
- **Choose the layer with care.** `agent` is just you. `project` is for every agent in this project. `node` is for everything on this Toto, and waits for the person to accept it, so use it only for something true everywhere.
- **Never keep a secret**: passwords, keys, tokens. Do not keep what is already in the code or the git history.
- **`forget`** a memory of yours that has turned out wrong.

## Tasks

- **`raise_task`** when you notice something that is not for you to do right now: a follow-up, a bug outside what you were asked, an idea. Write it so it makes sense by itself, and attach a file if it helps (a log, a screenshot).
- **`list_tasks`** shows what is open in this project. When you are given a task, use `get_task_file` for any file attached to it, and `done_task` when the work is finished.
