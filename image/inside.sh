#!/bin/bash
# Runs inside the image while it is being built (see build.sh). Turns stock Raspberry Pi OS Lite
# into a Toto: the server installed, a console screen in place of a login, nothing unique to one device.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive TOTO_IMAGE=1

# Services cannot be started in here, and packages must not try.
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d

/opt/toto-src/install.sh

# --- The device's own display shows Toto's screen, not a login prompt (bin/toto-screen says how).
/opt/toto/bin/toto-screen on

# --- No first-boot questions. Stock Raspberry Pi OS stops to ask for a user name and password on
# its display; a Toto is set up from a phone instead. (Presets made in Raspberry Pi Imager still apply.)
systemctl mask userconfig.service 2>/dev/null || true
systemctl disable userconfig.service 2>/dev/null || true

# --- Leave nothing behind that belongs to this build or would be shared by every device.
rm -f /etc/toto.env /usr/sbin/policy-rc.d
rm -rf /var/lib/toto/* /var/lib/toto/.[!.]* 2>/dev/null || true
apt-get clean
rm -rf /var/lib/apt/lists/* /root/.npm /tmp/* /var/tmp/* 2>/dev/null || true
echo "Image prepared: $(node -v), $(claude --version 2>/dev/null | head -1), $(dpkg -l | grep -c '^ii') packages."
