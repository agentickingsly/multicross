import { Request, Response, NextFunction } from "express";
export interface JwtPayload {
    userId: string;
    email: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
