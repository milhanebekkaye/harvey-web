/**
 * Claude API Client
 *
 * Handles all communication with Claude API.
 * Singleton pattern matching prisma.ts approach to prevent
 * multiple client instances in serverless environment.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { StoredMessage } from '../../types/api.types'
import { COMPLETION_MARKER } from './prompts'
import { MODELS } from './models'

/**
 * Singleton client instance
 *
 * In development, we cache the client on globalThis to survive hot reloads.
 * In production, each cold start gets a new client.
 */
const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined
}

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForAnthropic.anthropic = anthropic
}

/**
 * Configuration for Claude API calls (max tokens only).
 * Model selection is centralized in src/lib/ai/models.ts.
 */
export const CLAUDE_CONFIG = {
  maxTokens: 300,
} as const

const RETRYABLE_STATUSES = [429, 529] as const
const DEFAULT_MAX_RETRIES = 3
const INITIAL_DELAY_MS = 2000

/**
 * Returns true if the error is a retryable Anthropic API error (rate limit or overloaded).
 */
export function isRetryableAnthropicError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const status = (error as { status?: number }).status
    if (typeof status === 'number' && RETRYABLE_STATUSES.includes(status as 429 | 529)) return true
  }
  const msg = error instanceof Error ? error.message : String(error)
  return (
    /\.?529\b/.test(msg) ||
    /\boverloaded\b/i.test(msg) ||
    /\boverloaded_error\b/.test(msg) ||
    /\brate_limit\b/i.test(msg) ||
    /\b429\b/.test(msg)
  )
}

/**
 * Run an async function and retry on Anthropic 429/529 with exponential backoff.
 */
export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (attempt === maxRetries || !isRetryableAnthropicError(e)) throw e
      const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt)
      console.warn(
        `[ClaudeClient] Retryable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`,
        e instanceof Error ? e.message : e
      )
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

/**
 * Convert stored messages to Claude API format
 *
 * Our StoredMessage format includes timestamp, but Claude API
 * only needs role and content.
 *
 * @param messages - Array of stored messages from Discussion
 * @returns Messages formatted for Claude API
 */
export function formatMessagesForClaude(
  messages: StoredMessage[]
): Anthropic.MessageParam[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))
}

/**
 * Send conversation to Claude and get response
 *
 * This is the main function for getting AI responses.
 * It handles the API call and extracts text from the response.
 *
 * @param systemPrompt - The system prompt for Harvey's behavior
 * @param messages - Conversation history formatted for Claude
 * @param model - Optional model id; defaults to MODELS.ONBOARDING_CHAT
 * @returns Claude's response text
 * @throws Error if API call fails
 */
export async function getChatCompletion(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  model: string = MODELS.ONBOARDING_CHAT
): Promise<string> {
  console.log('[ClaudeClient] Sending request to Claude')
  console.log('[ClaudeClient] Model:', model)
  console.log('[ClaudeClient] Message count:', messages.length)

  const response = await anthropic.messages.create({
    model,
    max_tokens: CLAUDE_CONFIG.maxTokens,
    system: systemPrompt,
    messages,
  })

  // Extract text from response content blocks
  // Claude can return multiple blocks, but we expect text for chat
  const textBlock = response.content.find((block) => block.type === 'text')
  const responseText = textBlock?.type === 'text' ? textBlock.text : ''

  console.log('[ClaudeClient] Response received')
  console.log('[ClaudeClient] Response length:', responseText.length)
  console.log('[ClaudeClient] Stop reason:', response.stop_reason)

  return responseText
}

/**
 * Check if response indicates intake is complete
 *
 * The system prompt instructs Harvey to include PROJECT_INTAKE_COMPLETE
 * when all required information has been gathered.
 *
 * @param response - Claude's response text
 * @returns True if intake is complete
 */
export function isIntakeComplete(response: string): boolean {
  return response.includes(COMPLETION_MARKER)
}

/**
 * Clean the completion marker from response
 *
 * Before sending response to frontend, we strip the marker
 * so users don't see "PROJECT_INTAKE_COMPLETE" in the chat.
 *
 * @param response - Claude's response text
 * @returns Response with marker removed
 */
export function cleanResponse(response: string): string {
  return response.replace(COMPLETION_MARKER, '').trim()
}
