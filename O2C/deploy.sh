#!/bin/bash

# ==============================================================================
# O2C Portal - Automated Deployment Script
# Run this script on your production Ubuntu/Debian server using: sudo bash deploy.sh
# ==============================================================================

echo "Starting automated deployment..."

# 1. Navigate to Git Repository
PROJECT_DIR="$HOME/P2P/O2C"
NGINX_DIR="/var/www/o2c"

echo "✅ Using project directory: $PROJECT_DIR"
cd "$PROJECT_DIR" || exit 1

# 2. Pull Latest Code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# 3. Setup the Backend
echo "⚙️ Setting up the Node.js Backend..."
cd server
npm install
pm2 restart all
pm2 save
echo "✅ Backend restarted with PM2."

# 4. Build the React Frontend
echo "📦 Building the React Frontend..."
cd "$PROJECT_DIR"
npm run build

if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "❌ Error: React build failed. 'dist' directory not found."
    exit 1
fi
echo "✅ React frontend built successfully."

# 5. Deploy Frontend to Nginx Directory
echo "🚚 Copying files to Nginx directory ($NGINX_DIR)..."
rm -rf "$NGINX_DIR"/*
cp -r dist/* "$NGINX_DIR"/

# 6. Fix Permissions
echo "🔒 Fixing File Permissions..."
chown -R www-data:www-data "$NGINX_DIR"
chmod -R 755 "$NGINX_DIR"

# 7. Restart Nginx
echo "🔄 Restarting Nginx..."
systemctl restart nginx
echo "✅ Nginx restarted successfully."

echo "=============================================================================="
echo "🎉 DEPLOYMENT COMPLETE! 🎉"
echo "Check backend status: pm2 status"
echo "Check Nginx status: systemctl status nginx"
echo "=============================================================================="

