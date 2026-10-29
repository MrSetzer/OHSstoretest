#!/bin/bash
# Double-click to start the OHS Store on a Mac.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "   One thing to install first: Node.js (free)."
  echo "   Your browser will now open the Node.js website."
  echo "   Click the big green button that says \"LTS\", install it,"
  echo "   then double-click \"Start OHS Store (Mac)\" again."
  echo
  open "https://nodejs.org/"
  read -r -p "   Press Enter to close this window."
  exit 1
fi

if [ ! -f data/store.json ]; then
  echo
  echo "   ====================================================="
  echo "     FIRST-TIME SETUP"
  echo "   ====================================================="
  echo
  echo "   Make up a password for the owner dashboard."
  echo "   Use at least 10 characters, and write it down somewhere safe."
  echo "   (Nothing shows while you type. That's normal.)"
  echo
  saved=""
  for try in 1 2 3 4 5; do
    read -r -s -p "   Type your new password and press Enter: " OHS_NEW_PASSWORD || break
    echo
    if OHS_NEW_PASSWORD="$OHS_NEW_PASSWORD" node scripts/set-password.js; then saved=1; break; fi
  done
  if [ -z "$saved" ]; then echo; echo "   No password was saved. Close this window and try again."; read -r -p ""; exit 1; fi
  unset OHS_NEW_PASSWORD
fi

clear
echo
echo "   ====================================================="
echo "     The OHS Store is running."
echo "   ====================================================="
echo
echo "   Store:      http://localhost:3000"
echo "   Dashboard:  http://localhost:3000/admin"
echo
echo "   Your web browser will open by itself in a moment."
echo
echo "   KEEP THIS WINDOW OPEN while you use the store."
echo "   To stop the store, just close this window."
echo
node server.js --open
