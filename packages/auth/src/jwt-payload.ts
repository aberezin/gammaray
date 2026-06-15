export interface JwtPayload {
  /** User ID */
  sub: string
  email: string
  /** Token class. Absent/`'access'` = access token; `'refresh'` = refresh token
   *  (only valid at /auth/refresh, never as a bearer for API calls). */
  type?: 'access' | 'refresh'
  iat?: number
  exp?: number
}
