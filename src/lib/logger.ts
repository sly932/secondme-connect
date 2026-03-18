import winston from "winston";
import path from "path";
import fs from "fs";

const isVercel = !!process.env.VERCEL;
const logDir = path.join(process.cwd(), "logs");

const transports: winston.transport[] = [];

if (!isVercel) {
  // 本地开发/自托管：写文件
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

// Vercel 或开发环境：输出到 console
if (isVercel || process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
          return `${timestamp} [${service}] ${level}: ${message}${extra}`;
        })
      ),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "connect" },
  transports,
});

export default logger;
