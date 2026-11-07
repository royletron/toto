---
name: docker
description: Run, build and compose containers for this project with the docker command, which is Podman running without root as this project's own user.
---

# Containers

`docker` is installed, but it is [Podman](https://podman.io) behind the same command line. It runs without root and without a background service, as this project's own Linux user, so a container can do no more here than you can. Most `docker` commands, `docker build` and `docker compose` work as they do elsewhere.

## Things to know

- **Name the registry in full:** `docker run docker.io/library/alpine`, not `docker run alpine`. A short name may be refused or ask a question there is nobody to answer.
- **This is a Raspberry Pi, so the processor is arm64.** An image has to be built for it, or for several. If you get an "exec format error", the image is for another kind of processor.
- **Ports below 1024 cannot be published.** Use a higher one, such as `-p 8080:80`.
- **There is no daemon,** so nothing starts again after the device restarts, and `--restart` policies do nothing. Do not leave a long-running container as the only way something works.
- **Compose** is `docker compose`, run by `podman-compose`: the common parts of a compose file work, some newer ones do not. If it fails on a feature, say so rather than rewriting the file around it.
- **Never use `--privileged`,** and do not try to reach the host's devices or mount its files outside this project. They are not available, and trying is a sign the task needs asking about.
- **Networking follows this project:** if it is kept off the local network, so are its containers.
- **Images and containers are kept in this project's home and use its disk,** which is small on a Raspberry Pi. Check with `docker system df`, and clean up what you made with `docker system prune`. Large images such as the ones for databases or machine learning take minutes to pull; say so before starting one.
- **Never put a secret in an image, a build argument or a command line.** Pass it in the environment of the container, from the environment you have.
