## What changed

<!-- One or two sentences. Which pages, and what's different? -->

Closes #<!-- issue number, if there is one -->

---

## Type of change

- [ ] ✏️ Correction — something was wrong or out of date
- [ ] 📄 New page or section
- [ ] 🔗 Broken link / image fix
- [ ] 💅 Formatting, typo, or wording
- [ ] 🎨 Site theme, component, or config
- [ ] 🔧 CI / tooling

---

## Why

<!-- What was wrong, or what was a reader unable to find?
     For a technical correction, say what you checked it against — a source file,
     a package version, or something you actually ran. -->

---

## Checklist

- [ ] `npm run build` passes locally (this is also the broken-link check)
- [ ] New pages are listed in `sidebars.ts`
- [ ] Links between pages use relative `.md` paths
- [ ] Code samples reflect what the shipped API actually does
- [ ] Package names match what's published (`@helixid/sdk-js`, not `@helixid/sdk`)

**If this touches claims about behaviour:**

- [ ] Nothing is described as "offline" without the "no synchronous call to the issuer" qualifier
- [ ] The two-issuer model is not collapsed into a single issuer
- [ ] Anything unshipped is on the roadmap with a `Planned` / `Parked` badge, not written in the present tense

---

## Screenshots

<!-- For theme, layout, or component changes. Light and dark, and a narrow
     viewport if the change could affect mobile. -->
