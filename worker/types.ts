export interface Env {
  DB: D1Database;
  APP_ENV?: string;
  DEV_USER_EMAIL?: string;
}

export interface RequestContext {
  readonly requestId: string;
  readonly actor: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: 'administrator';
  };
}
