# Combe Downer

## Workflow

- When a piece of work is done and checked (`cd web && npm run build` passes), merge it into
  `main` and push `main` straight away. Don't ask first and don't wait for a pull request: pushing
  `main` publishes the game to GitHub Pages, and that is the point.
- Before merging, bring in the latest `origin/main` and resolve any conflicts, keeping both sides'
  features.
