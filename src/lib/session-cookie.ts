// Not the Diary's "cs_session": cookies aren't separated by port, so one shared name
// would make the apps sign each other out when both run on localhost.
export const SESSION_COOKIE = "ct_session";
