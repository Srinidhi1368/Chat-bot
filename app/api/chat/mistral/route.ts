import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { ServerRuntime } from "next"

import {
  replaceWordsInLastUserMessage,
  updateOrAddSystemMessage,
  wordReplacements
} from "@/lib/ai-helper"
import PineconeRetriever from "@/lib/models/query-pinecone-2v"

import llmConfig from "@/lib/models/llm/llm-config"
import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"

class APIError extends Error {
  code: any
  constructor(message: string | undefined, code: any) {
    super(message)
    this.name = "APIError"
    this.code = code
  }
}

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, isRetrieval, isContinuation } = json as {
    chatSettings: ChatSettings
    messages: any[]
    isRetrieval: boolean
    isContinuation: boolean
  }

  try {
    const profile = await getServerProfile()

    checkApiKey(profile.openrouter_api_key, "OpenRouter")

    const openrouterApiKey = profile.openrouter_api_key || ""

    let selectedModel
    let rateLimitCheckResult
    let similarityTopK

    if (chatSettings.model === "mistral-large") {
      selectedModel = llmConfig.models.hackerGPT_pro

      similarityTopK = 3

      rateLimitCheckResult = await checkRatelimitOnApi(profile.user_id, "gpt-4")
    } else {
      selectedModel = llmConfig.models.hackerGPT_default

      similarityTopK = 2

      rateLimitCheckResult = await checkRatelimitOnApi(
        profile.user_id,
        "hackergpt"
      )
    }

    if (rateLimitCheckResult !== null) {
      return rateLimitCheckResult.response
    }

    let modelTemperature = 0.4

    const openRouterUrl = llmConfig.openrouter.url
    const openRouterHeaders = {
      Authorization: `Bearer ${openrouterApiKey}`,
      "HTTP-Referer": "https://chat.hackerai.co",
      "X-Title": "HackerGPT",
      "Content-Type": "application/json"
    }

    const cleanedMessages = messages

    const systemMessageContent = `${llmConfig.systemPrompts.hackerGPT}`
    updateOrAddSystemMessage(cleanedMessages, systemMessageContent)

    // On normal chat, the last user message is the target standalone message
    // On continuation, the tartget is the last generated message by the system
    const targetStandAloneMessage =
      cleanedMessages[cleanedMessages.length - 2].content
    const filterTargetMessage = isContinuation
      ? cleanedMessages[cleanedMessages.length - 3]
      : cleanedMessages[cleanedMessages.length - 2]

    if (!isRetrieval) {
      if (
        llmConfig.usePinecone &&
        cleanedMessages.length > 0 &&
        filterTargetMessage.role === "user" &&
        filterTargetMessage.content.length >
          llmConfig.pinecone.messageLength.min &&
        filterTargetMessage.content.length <
          llmConfig.pinecone.messageLength.max
      ) {
        const standaloneQuestion = await generateStandaloneQuestion(
          messages,
          targetStandAloneMessage,
          openRouterUrl,
          openRouterHeaders
        )

        const pineconeRetriever = new PineconeRetriever(
          llmConfig.openai.apiKey,
          llmConfig.pinecone,
          similarityTopK
        )

        const pineconeResults =
          await pineconeRetriever.retrieve(standaloneQuestion)

        if (pineconeResults !== "None") {
          modelTemperature = llmConfig.pinecone.temperature
          selectedModel = llmConfig.models.hackerGPT_RAG

          cleanedMessages[0].content =
            `${llmConfig.systemPrompts.hackerGPT} ` +
            `${llmConfig.systemPrompts.pinecone} ` +
            `Context for RAG enrichment:\n` +
            `---------------------\n` +
            `${pineconeResults}\n` +
            `---------------------\n` +
            `DON'T MENTION OR REFERENCE ANYTHING RELATED TO RAG CONTENT OR ANYTHING RELATED TO RAG. ROLE PLAY.`
        }
      }
    }

    // If the user uses the web scraper plugin, we must switch to the rag model.
    if (cleanedMessages[0].content.includes("<USER HELP>")) {
      selectedModel = llmConfig.models.hackerGPT_RAG
    }

    // If the user is using the mistral-large model, we must always switch to the pro model.
    if (chatSettings.model === "mistral-large") {
      selectedModel = llmConfig.models.hackerGPT_pro
    }

    replaceWordsInLastUserMessage(cleanedMessages, wordReplacements)

    const requestBody = {
      model: selectedModel,
      route: "fallback",
      messages: cleanedMessages
        .filter(msg => !(msg.role === "assistant" && msg.content === ""))
        .map(msg => ({
          role: msg.role,
          content: msg.content
        })),
      temperature: modelTemperature,
      max_tokens: 1024,
      stream: true
    }

    try {
      const res = await fetch(openRouterUrl, {
        method: "POST",
        headers: openRouterHeaders,
        body: JSON.stringify(requestBody)
      })

      if (!res.ok) {
        const result = await res.json()
        let errorMessage = result.error?.message || "An unknown error occurred"

        switch (res.status) {
          case 400:
            throw new APIError(`Bad Request: ${errorMessage}`, 400)
          case 401:
            throw new APIError(`Invalid Credentials: ${errorMessage}`, 401)
          case 402:
            throw new APIError(`Out of Credits: ${errorMessage}`, 402)
          case 403:
            throw new APIError(`Moderation Required: ${errorMessage}`, 403)
          case 408:
            throw new APIError(`Request Timeout: ${errorMessage}`, 408)
          case 429:
            throw new APIError(`Rate Limited: ${errorMessage}`, 429)
          case 502:
            throw new APIError(`Service Unavailable: ${errorMessage}`, 502)
          default:
            throw new APIError(`HTTP Error: ${errorMessage}`, res.status)
        }
      }

      if (!res.body) {
        throw new Error("Response body is null")
      }
      return res
    } catch (error) {
      if (error instanceof APIError) {
        console.error(
          `API Error - Code: ${error.code}, Message: ${error.message}`
        )
      } else if (error instanceof Error) {
        console.error(`Unexpected Error: ${error.message}`)
      } else {
        console.error(`An unknown error occurred: ${error}`)
      }
    }
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenRouter API Key not found. Please set it in your profile settings."
    } else if (errorCode === 401) {
      errorMessage =
        "OpenRouter API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}

async function generateStandaloneQuestion(
  messages: any[],
  latestUserMessage: any,
  openRouterUrl: string | URL | Request,
  openRouterHeaders: any
) {
  // Removed the filter for the standalone question as we already have one before this function is called
  //if (messages.length < 4 || latestUserMessage.length > 256) {
  //return latestUserMessage
  //}

  // Faster and smaller model for standalone questions for reduced latency
  const modelStandaloneQuestion = "mistralai/mistral-7b-instruct:nitro"

  let chatHistory = messages
    .filter(msg => !(msg.role === "assistant" && msg.content === ""))
    .slice(1, -1) // Remove the first (system prompt) and the last message (user message)
    .slice(-3) // Get the last 3 messages only (assistant, user, assistant)
    .map(msg => `${msg.role}: ${msg.content}`)
    .join("\n")

  console.log("chatHistory:", chatHistory)

  // Compressed prompt with HyDE
  const template = `
  Your are HackerGPT is an expert in hacking, particularly in the areas of bug bounty, hacking, penetration testing. You are having a conversation with an user and you want to enrich your answer with some expert knowledge.
  Objective 1: Craft a standalone question for a specialist who is unfamiliar with the conversation, based on the given follow-up question and chat history. The question should:

1. Emphasize relevant keywords
2. Seek specific actions or information 
3. Provide full context while being concise
4. Be phrased as a clear, direct question
5. Exclude irrelevant details

Input:
- Chat History: """${chatHistory}"""
- Follow Up: """${latestUserMessage}"""

Objective 2: Generate an answer for the user question using the best of your knowledge.

Output:
The rephrased standalone question to ask the specialist and then your answer to the user question.`

  const firstMessage = messages[0]
    ? messages[0]
    : { role: "system", content: `${llmConfig.systemPrompts.hackerGPT}` }

  try {
    const requestBody = {
      model: modelStandaloneQuestion,
      route: "fallback",
      messages: [
        { role: firstMessage.role, content: firstMessage.content },
        { role: "user", content: template }
      ],
      temperature: 1.0, // High temperature for creativity
      max_tokens: 256
    }

    const res = await fetch(openRouterUrl, {
      method: "POST",
      headers: openRouterHeaders,
      body: JSON.stringify(requestBody)
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error("Error Response Body:", errorBody)
      throw new Error(
        `HTTP error! status: ${res.status}. Error Body: ${errorBody}`
      )
    }

    const data = await res.json()

    const standaloneQuestion = data.choices?.[0]?.message?.content?.trim()
    return standaloneQuestion
  } catch (error) {
    console.error("Error in generateStandaloneQuestion:", error)
    return latestUserMessage
  }
}
