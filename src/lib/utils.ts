import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Removes leading and trailing "**" from a string (e.g. markdown bold wrappers). */
export function stripWrappingBold(s: string | null | undefined): string {
  if (s == null || s === '') return ''
  return s.replace(/^\*\*/, '').replace(/\*\*$/, '')
}
