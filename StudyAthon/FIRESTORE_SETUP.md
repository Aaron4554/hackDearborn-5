# Firestore profile data

Deploy the rules in `firestore.rules` before using signup and profile setup:

```sh
firebase deploy --only firestore:rules
```

Each account has two profile documents keyed by its Firebase Auth UID:

- `users/{uid}` contains friend lookup and ranking fields: `uid`, `username`,
  `usernameLower`, `tag`, `points`, and `createdAt`. Authenticated users can
  fetch a known profile UID; listing the directory is denied.
- `userPrivate/{uid}` contains `firstName`, `lastName`, `educationLevel`,
  `gradeLevel`, `takesAdvancedClasses`, `age`, and `createdAt`. Only that user
  can read it. Age and fields that do not apply to the selected education level
  are stored as `null`.

The app creates the public and private documents together when it reserves the
username tag. `getPersonalInfo(uid)` in `services/social.ts` retrieves the
private details for the signed-in user's UID; Firestore rules reject reads for
other users.
