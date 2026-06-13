#!/bin/bash
set -e

echo "Starting AtomQuest Server Setup..."

# Update and install dependencies
sudo apt update
sudo apt install -y curl nginx git

# Install Node.js (v22)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Configure Firewall (UFW)
echo "Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw allow 1024:65535/udp # WebRTC UDP port range
sudo ufw --force enable

echo "System dependencies installed and firewall configured."
echo "Next steps:"
echo "1. Clone or copy your code to this server."
echo "2. Run 'npm install --production'."
echo "3. Copy nginx.conf to /etc/nginx/sites-available/default and restart Nginx."
echo "4. Run 'pm2 start ecosystem.config.cjs' and 'pm2 save'."
