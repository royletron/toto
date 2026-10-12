# syntax=docker/dockerfile:1
# A whole Toto server in a container: the same programs a Raspberry Pi runs, without the Bluetooth
# and Wi-Fi, started by an entrypoint instead of systemd. Build from the repository root:
#   docker build -f docker/Dockerfile -t toto .
# Not the relay: that is a Cloudflare Worker.
FROM debian:13-slim

# 0 leaves out Chromium and its tools, for a smaller image without the agents' browser.
ARG WITH_BROWSER=1
ENV DEBIAN_FRONTEND=noninteractive

# What install.sh puts on a Pi, less what only a Pi needs. The package lists are kept, as plugins
# install packages from them while it runs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg git openssh-client sudo tmux nftables openssl procps tini util-linux \
 && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && npm install -g @anthropic-ai/claude-code
# The browser for agents. The version is the one install.sh pins; a test keeps the two together.
RUN if [ "$WITH_BROWSER" = 1 ]; then apt-get install -y --no-install-recommends chromium && npm install -g chrome-devtools-mcp@1.10.1; fi

# The server runs as `toto`, and each project gets a user of its own in `toto-projects`, as on a Pi.
RUN useradd --system --home-dir /var/lib/toto --no-create-home --shell /usr/sbin/nologin toto \
 && groupadd --system toto-projects \
 && install -d -o toto -g toto -m 700 /var/lib/toto \
 && install -d -m 755 /opt/toto/bin /var/lib/toto-plugins /etc/toto \
 && install -d -o toto -g toto -m 750 /run/toto

COPY bin/toto-priv bin/toto-update.mjs bin/toto-plugin.mjs bin/toto-progress.mjs /opt/toto/bin/
COPY release.pub plugin.pub protocol.ts /opt/toto/
COPY server /opt/toto/server
RUN chmod 755 /opt/toto/bin/* \
 && cd /opt/toto/server && rm -rf node_modules && npm install --omit=dev --no-audit --no-fund
COPY docker/entrypoint.sh /opt/toto/bin/entrypoint
RUN chmod 755 /opt/toto/bin/entrypoint \
 && printf '#!/bin/sh\nexec /usr/bin/node /opt/toto/server/src/cli.ts "$@"\n' > /usr/local/bin/toto && chmod 755 /usr/local/bin/toto \
 && printf 'toto ALL=(root) NOPASSWD: /opt/toto/bin/toto-priv\ntoto ALL=(%%toto-projects) NOPASSWD:SETENV: ALL\n' > /etc/sudoers.d/toto \
 && chmod 440 /etc/sudoers.d/toto && visudo -cf /etc/sudoers.d/toto

ENV TOTO_CONTAINER=1 TOTO_ISOLATE=1 TOTO_DATA_DIR=/var/lib/toto RUNTIME_DIRECTORY=/run/toto TOTO_PORT=7860
EXPOSE 7860
# Everything that is yours: the Toto's state, token and keys, and its projects (the files of each project user).
VOLUME ["/var/lib/toto", "/home"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "require('net').connect(7860,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/toto/bin/entrypoint"]
