#!/bin/bash

# Cloudflare Tunnel Setup Script for Ground Station
# This script helps configure the Cloudflare tunnel for station.hoan.uk

echo "Cloudflare Tunnel Configuration for Ground Station"
echo "=============================================="

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed. Please install it first:"
    echo "   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    echo "   sudo dpkg -i cloudflared-linux-amd64.deb"
    exit 1
fi

echo "✅ cloudflared is installed"

# Get tunnel ID from user
echo ""
echo "Please enter your Cloudflare tunnel ID:"
read -p "Tunnel ID: " TUNNEL_ID

if [ -z "$TUNNEL_ID" ]; then
    echo "❌ Tunnel ID is required"
    exit 1
fi

# Get username for credentials path
echo ""
echo "Please enter your username (for credentials file path):"
read -p "Username: " USERNAME

if [ -z "$USERNAME" ]; then
    USERNAME=$(whoami)
    echo "Using current username: $USERNAME"
fi

# Update the configuration file
CONFIG_FILE="/home/hoan/DATA/ground-station/ground-station/cloudflare-tunnel.yml"

sed -i "s/<YOUR_TUNNEL_ID>/$TUNNEL_ID/g" "$CONFIG_FILE"
sed -i "s/<USER>/$USERNAME/g" "$CONFIG_FILE"

echo ""
echo "✅ Configuration updated:"
echo "   Tunnel ID: $TUNNEL_ID"
echo "   Hostname: station.hoan.uk"
echo "   Target: http://192.168.6.15:7000"

echo ""
echo "To start the tunnel, run:"
echo "   cloudflared tunnel --config $CONFIG_FILE run $TUNNEL_ID"
echo ""
echo "To run as a service:"
echo "   sudo cloudflared service install"
echo "   sudo systemctl enable cloudflared"
echo "   sudo systemctl start cloudflared"
echo ""
echo "Make sure your DNS record is configured in Cloudflare dashboard:"
echo "   station.hoan.uk -> CNAME -> $TUNNEL_ID.cfargotunnel.com"
