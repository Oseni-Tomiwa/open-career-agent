export interface EmailService {
  sendVerificationEmail(input: {
    readonly email: string;
    readonly actionUrl: string;
    readonly expiresAt: Date;
  }): Promise<void>;
  sendPasswordResetEmail(input: {
    readonly email: string;
    readonly actionUrl: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}

/** Local development deliberately exposes links through the API response only. */
export class DevelopmentEmailService implements EmailService {
  public sendVerificationEmail(): Promise<void> {
    return Promise.resolve();
  }

  public sendPasswordResetEmail(): Promise<void> {
    return Promise.resolve();
  }
}
