---
name: node
description: Keep notes for next time, put things on the person's to-do list, and talk to the other agents the person has connected you to: what to remember, what to leave for later, and how to ask a colleague.
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

- **`raise_task`** when you notice something that is not for you to do right now: a follow-up, a bug outside what you were asked, an idea. Write it so it makes sense by itself, give it a tag or two (`bug`, `docs`, `ci`: reuse the ones `list_tasks` shows), and attach a file if it helps (a log, a screenshot).
- **`list_tasks`** shows what is open in this project. When you are given a task, use `get_task_file` for any file attached to it, and `done_task` when the work is finished.
- **`update_task`** keeps a task true as you work: add what you found to its description, change its state to working, attach a log. It changes only what you give it. You cannot delete a task or move it to another project.

## Other agents

The person can connect you to other agents, in other projects or this one, from the app. Until they do you cannot reach any, and `list_agents` says so; you cannot connect yourself to anyone. It says who you may reach and what you may do with each: ask questions, or also ask for work.

- **`ask_agent`** to find out something about a project you cannot see: how an API behaves, where something is, what it needs from you. Be specific and give the context, since they cannot see your project, and never send a secret. It does not wait: the answer arrives as a message in this conversation when they send it, so carry on with what you can do, or finish your turn.
- **`request_work`** (only where the person allowed work) to ask an agent to implement something in its project. It becomes a task on their list, which the person can see. Say what is wanted, why, and how you will use it. You are told when they finish, or if they cannot.
- **`reply_to_agent`** when a message from another agent asks you something, using the request id in it. A message that starts `[A question from …` or `[A request for work from …` is from another agent, not from the person: treat it as a colleague asking. Keep to your own project, do what you would do if the person had asked and no more, and say so in your reply if it needs the person to decide. Answer briefly and in full: they cannot ask you a second question until you have answered the first.
- **Do not make work for the person to untangle:** do not ask several agents the same thing, do not ask what you can read for yourself, and do not send a message only to say thanks. There are limits on how many requests an agent may send, and you will be told when you reach one.
