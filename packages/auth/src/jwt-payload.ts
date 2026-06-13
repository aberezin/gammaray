export interface JwtPayload {
  /** User ID */
  sub: string
  email: string
  iat?: number
  exp?: number
}
