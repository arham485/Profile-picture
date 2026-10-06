# PFP Face-Off

A small GitHub Pages site where friends enter their name and judge your photos head-to-head until one photo wins.

## Final setup

The site uses Firebase Anonymous Authentication for visitors and Firebase Email/Password Authentication for developer mode. Firestore only accepts completed 10-photo responses from authenticated anonymous users, and only the developer UID can read the responses.

The Firebase web config is public by design. Never add Firebase Admin SDK credentials, service-account JSON files, private keys, passwords, or other server-side secrets to this repository.

## Add your photos

Put these files inside `photos/`:

- `photo-01.jpg`
- `photo-02.jpg`
- `photo-03.jpg`
- `photo-04.jpg`
- `photo-05.jpg`
- `photo-06.jpg`
- `photo-07.jpg`
- `photo-08.jpg`
- `photo-09.jpg`
- `photo-10.jpg`

## Firebase setup

1. Create a Firebase project.
2. Add a Web App.
3. Enable Authentication with Email/Password.
4. Enable Authentication with Anonymous.
5. Create a Firestore Database in Production mode.
6. Create your developer user in Authentication.
7. Copy the developer User UID.
8. Put your Firebase web config into `firebase-config.js`.
9. Replace `YOUR_DEVELOPER_UID` in `firestore.rules` with your real developer UID.
10. Publish the rules in Firestore.
11. Add your GitHub Pages domain to Firebase Authentication authorized domains.

## Formspree

The current config contains the Formspree endpoint you supplied. The endpoint is browser-visible, so it is not a secret. Protect the form with Formspree's available spam controls.

## GitHub Pages

Upload the project files to your GitHub repository. Then open GitHub repository settings, open Pages, choose Deploy from a branch, select `main` and `/ (root)`, and save.

The site is static, so GitHub Pages does not need a server of its own.

## Security

Public users can submit a completed result but cannot read, edit, or delete stored responses. The dashboard can only read responses while signed into the Firebase developer account whose UID is listed in the Firestore rules.

Do not upload private credentials. Anything placed in `photos/` is publicly accessible because GitHub Pages is public.
