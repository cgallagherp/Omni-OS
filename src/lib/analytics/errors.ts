/** The governed data source cannot answer (not connected, or this domain is not authorised). */
export class SourceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailable";
  }
}
