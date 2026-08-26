#!/bin/bash
# Push the Naseeb POS project to GitHub
# Run this from your local machine where you have GitHub authentication.
#
# Prerequisites:
#   - Git installed
#   - GitHub account with access to faheemmarkhand-ship-it/POC repo
#   - Either: GitHub CLI (gh auth login) OR a personal access token
#
# If using a token, set it as an env var first:
#   export GITHUB_TOKEN=ghp_your_token_here
#
# Then run:
#   bash push-to-github.sh

set -e
cd /home/z/my-project

echo "=== Current commit ==="
git log --oneline -1

echo ""
echo "=== Remote ==="
git remote -v

echo ""
echo "=== Pushing to GitHub ==="
if [ -n "$GITHUB_TOKEN" ]; then
  git push https://$GITHUB_TOKEN@github.com/faheemmarkhand-ship-it/POC.git main
else
  git push -u origin main
fi

echo ""
echo "✓ Push complete!"
echo "Repo: https://github.com/faheemmarkhand-ship-it/POC"
echo ""
echo "Next steps for Vercel deployment:"
echo "1. Go to https://vercel.com/new"
echo "2. Import the faheemmarkhand-ship-it/POC repository"
echo "3. Set environment variables:"
echo "   - NEXT_PUBLIC_SUPABASE_URL=https://tiybeuglcubkndufyisp.supabase.co"
echo "   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_pqBNliqYZs1hTq-O4Cb4ow_wEZIABye"
echo "   - SUPABASE_SERVICE_ROLE_KEY=<find in Supabase Dashboard → Settings → API>"
echo "4. Deploy"
