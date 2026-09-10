export interface Env {
  DB: D1Database;
  SCHOOL_ASSETS: R2Bucket;
  APP_ENV?: string;
  DEPLOYMENT_VERSION?: string;
  DEV_USER_EMAIL?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
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
