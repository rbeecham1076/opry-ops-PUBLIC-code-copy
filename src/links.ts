// Drive documents used all over the app, so each is linked from one place wherever it's mentioned.
const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`
const sheet = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`
const file = (id: string) => `https://drive.google.com/file/d/${id}/view`
export const LINKS = {
  opryAdvanceSheet: sheet('REDACTED'),
  etownAdvanceSheet: sheet('REDACTED'),
  hotelRooms: sheet('REDACTED'),
  techRider: doc('REDACTED'),
  adminChecklist: doc('REDACTED'),
  handbook: doc('REDACTED'),
  venueInfoOpry: file('REDACTED'),
  venueInfoState: doc('REDACTED'),
  venueInfoMarion: file('REDACTED'),
  eventInsuranceHowTo: file('REDACTED'),
}
// Show-fact fields that should link straight to the document they come from.
export const FACT_LINKS: Record<string, [string, string]> = {
  'Hotel': ['Hotel Rooms sheet', LINKS.hotelRooms],
  'Rooms × nights': ['Hotel Rooms sheet', LINKS.hotelRooms],
  'Stage plot': ['Kentucky Opry tech rider', LINKS.techRider],
  'Sound tech': ['Kentucky Opry tech rider', LINKS.techRider],
  'Backline': ['Advance sheet', LINKS.opryAdvanceSheet],
  'Tour manager / production contact': ['Advance sheet', LINKS.opryAdvanceSheet],
  'Load-in': ['Advance sheet', LINKS.opryAdvanceSheet],
  'Soundcheck': ['Advance sheet', LINKS.opryAdvanceSheet],
}
