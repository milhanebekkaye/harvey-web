/**
 * API Type Definitions
 *
 * Request and response types for the chat API endpoints.
 * Used by both frontend and backend for type safety.
 */

/**
 * Chat API Request Body
 *
 * Sent by frontend when user submits a message.
 */
export interface ChatRequest {
  /**
   * User's message content
   */
  message: string

  /**
   * Project ID for continuing conversation
   * - undefined/null: First message, will create new project
   * - string: Continue existing conversation
   */
  projectId?: string
}

/**
 * Chat API Response Body
 *
 * Returned by POST /api/chat
 */
export interface ChatResponse {
  /**
   * Claude's response message (with PROJECT_INTAKE_COMPLETE stripped)
   */
  response: string

  /**
   * Whether the intake process is complete
   * True when response contained PROJECT_INTAKE_COMPLETE
   */
  isComplete: boolean

  /**
   * Project ID (always returned)
   * - Created on first message
   * - Same as request on subsequent messages
   */
  projectId: string

  /**
   * Whether extraction/schedule generation has started
   * For future use when we add background processing
   */
  extractionStarted?: boolean
}

/**
 * Chat API Error Response
 *
 * Returned when an error occurs
 */
export interface ChatErrorResponse {
  /**
   * Human-readable error message
   */
  error: string

  /**
   * Machine-readable error code
   * Used by frontend for specific error handling
   */
  code?: string
}

/**
 * Stored Message Format
 *
 * How messages are stored in Discussion.messages JSON array.
 * Matches Claude API format for easy conversion.
 */
export interface StoredMessage {
  /**
   * Who sent the message
   * - 'assistant': Harvey (Claude)
   * - 'user': The human user
   */
  role: 'assistant' | 'user'

  /**
   * The message content (text)
   */
  content: string

  /**
   * When the message was created (ISO 8601 string)
   */
  timestamp: string
}
