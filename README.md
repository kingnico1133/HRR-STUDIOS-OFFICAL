# HRR Studios

The official website repository for **HRR Studios**, an independent game-development studio.

> We build worlds that weren't meant to exist.

## Website

The site is a lightweight, static HTML/CSS/JavaScript project. It currently includes:

- **Home page** — studio introduction and lore.
- **Games page** — a playable archive featuring *VOID BREACH: LITE*.
- **Updates section** — studio progress updates.
- **Join section** — an application link for people interested in the studio.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Main HRR Studios website |
| `games.html` | Games archive and embedded game page |
| `game.html` | Game implementation |

## Run locally

No build step or package installation is required.

1. Download or clone this repository.
2. Open `index.html` in a modern web browser.
3. Use the navigation to visit the games page and other sections.

Some visual styling loads Google Fonts, so those fonts require an internet connection. The site itself is made from static files.

## Deployment

This repository can be hosted as a static website, for example with GitHub Pages. Configure the hosting source to use the repository's `main` branch and root folder if you choose to enable GitHub Pages.

## Security note

The current website includes an admin interface implemented in front-end JavaScript and browser storage. Anything shipped to a visitor's browser can be inspected or changed by that visitor, so a password check in client-side code is **not secure authentication**. Do not use it to protect private information or sensitive publishing actions. Real admin access should be handled by a trusted server-side service.

## Contact and community

- YouTube: [HRR Studios](https://www.youtube.com/channel/UCC9YsbvIczQLatE1KFsD7YA)
- Contact: hrrstudiosofficial@gmail.com

---

HRR Studios — official website source.
