#!/bin/bash
# What starts a Toto in a container: the things toto-firstboot and systemd do on a Pi. Runs as root,
# makes what has to be made, says how to add the Toto in the app, and then becomes the server as
# the unprivileged toto user.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "toto: the container has to start as root. It drops to the toto user itself." >&2; exit 1; }
DATA="${TOTO_DATA_DIR:-/var/lib/toto}"
install -d -o toto -g toto -m 700 "$DATA"
install -d -o toto -g toto -m 750 /run/toto

# The token is made once and kept in the data volume, unless one is given.
if [ -z "${TOTO_TOKEN:-}" ]; then
  if [ ! -s "$DATA/token" ]; then
    (umask 077; openssl rand -hex 16 > "$DATA/token")
  fi
  chown toto:toto "$DATA/token"
  chmod 600 "$DATA/token"
  TOTO_TOKEN="$(cat "$DATA/token")"
fi
export TOTO_TOKEN
# On, like the image for a Pi, unless set to nothing: a phone then reaches this Toto from anywhere
# with no port forwarded. The relay only passes on sealed messages.
export TOTO_RELAY_URL="${TOTO_RELAY_URL-wss://toto.royletron.dev}"

# Projects are walled off from the home network by the firewall, which needs NET_ADMIN. Without it
# that is said now, rather than found out when the first project is made; or, if the network is
# walled off some other way, TOTO_NO_FIREWALL=1 says so, in a file only root can write.
if [ "${TOTO_NO_FIREWALL:-}" = 1 ]; then
  : > /etc/toto/no-firewall
  echo "toto: no firewall for projects (TOTO_NO_FIREWALL=1). Agents can reach this container's whole network." >&2
else
  rm -f /etc/toto/no-firewall
  if ! { nft add table inet toto_check && nft delete table inet toto_check; } >/dev/null 2>&1; then
    cat >&2 <<'EOF'
toto: this container cannot change its firewall, which is what keeps each project's agents off your
home network. Start it with --cap-add NET_ADMIN (cap_add: [NET_ADMIN] in compose). If the network
is walled off some other way, such as a Docker network with no route to your LAN, set
TOTO_NO_FIREWALL=1 to say so.
EOF
    exit 1
  fi
fi

# A project's user lives in this container's /etc/passwd, which a newer image does not have. Make
# any that are missing again, with the id that owns its files.
for home in /home/toto-p-*; do
  [ -d "$home" ] || continue
  user="$(basename "$home")"
  [[ "$user" =~ ^toto-p-[a-f0-9]{8}$ ]] || continue
  id "$user" >/dev/null 2>&1 && continue
  uid="$(stat -c %u "$home")"
  # Only ids that are projects' own (see toto-priv); anything else is left for someone to look at.
  if [ "$uid" -ge 50000 ] && [ "$uid" -le 59999 ]; then
    getent group "$uid" >/dev/null || groupadd -g "$uid" "$user"
    useradd --no-create-home --home-dir "$home" --shell /bin/bash -u "$uid" -g "$uid" -G toto-projects "$user"
    echo "toto: made project user $user again"
  fi
done

# How to add this Toto in the app. To a terminal only, as a log keeps what it is given and this is
# the token: `docker run -it`, or `docker exec -it NAME toto login` whenever it is wanted.
if [ -t 1 ] || [ "${TOTO_SHOW_LOGIN:-}" = 1 ]; then
  /usr/bin/node /opt/toto/server/src/cli.ts login || true
else
  echo "toto: to see how to add this Toto in the app, run: docker exec -it <this container> toto login"
fi

cd /opt/toto/server
exec setpriv --reuid=toto --regid=toto --init-groups /usr/bin/node src/index.ts
