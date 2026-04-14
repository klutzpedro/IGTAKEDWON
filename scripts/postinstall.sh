#!/bin/bash
# Post-install script: install Playwright Chromium
echo "Installing Playwright Chromium..."
python3 -m playwright install chromium
echo "Chromium installation complete"
