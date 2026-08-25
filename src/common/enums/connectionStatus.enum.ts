export enum ConnectionStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  IGNORED = "IGNORED",
  WITHDRAWN = "WITHDRAWN",
}

/**
 * Relationship of the viewer to a profile being viewed.
 * Returned by NetworkService.getPublicProfile so the UI can pick the right
 * primary action button (Connect / Pending / Accept / Message).
 */
export enum ViewerConnectionState {
  SELF = "SELF",
  NONE = "NONE",
  PENDING_OUTGOING = "PENDING_OUTGOING",
  PENDING_INCOMING = "PENDING_INCOMING",
  CONNECTED = "CONNECTED",
}
