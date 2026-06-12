# Threshold Salon — Website

The website for Threshold Salon, built with [Next.js](https://nextjs.org) and
[Tailwind CSS](https://tailwindcss.com), deployed automatically to GitHub Pages.

## Working on the site

```bash
npm install     # first time only
npm run dev     # start a local preview at http://localhost:3000
```

Edit `app/page.tsx` to change the homepage content (services, prices, hours,
contact info). Changes appear in the local preview instantly.

## Publishing changes

Every push to the `main` branch automatically rebuilds and publishes the site
via GitHub Actions (see `.github/workflows/deploy.yml`):

```bash
git add -A
git commit -m "Describe your change"
git push
```

The live site updates a minute or two later.

## To-do before launch

- [ ] Replace placeholder address, phone, and email in `app/page.tsx`
- [ ] Set real services and pricing
- [ ] Add salon photos
- [ ] Decide on booking: link to a service (Square, Vagaro) or build custom
- [ ] Attach a custom domain (Settings → Pages on GitHub), then remove the
      `basePath` from `next.config.ts`
