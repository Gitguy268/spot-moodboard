# Contributing

Bug reports and pull requests are welcome. For a large change, open an issue first so we can talk it through.

1. Fork the repository and create a branch.
2. Open `index.html` in a browser (or double-click `start.command`). There is no build step: the CSS and JavaScript live inside `index.html`.
3. Run `npm ci`, `npx playwright install chromium webkit` and `npm run smoke` before opening the pull request.
4. Keep the pull request small and focused, and describe what you changed and why.

**Pictures.** The pictures of Spot are not under the MIT licence; please don't reuse them elsewhere. New pictures go through `scripts/prepare-images.mjs`, which strips all metadata, pixelates collar tags and gives each file a neutral name. A picture must not show a person, a readable name tag, an address, a phone number or a QR code.

Never commit secrets, API keys or `.env` files. By contributing you agree that your work is released under this project's licence.
