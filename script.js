/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const clearChatBtn = document.getElementById("clearChatBtn");

/*
  System prompt:
  Keeps the assistant focused on L'Oreal products, routines, and recommendations only.
*/
const SYSTEM_PROMPT =
  "You are the L'Oreal Smart Routine and Product Advisor. You must only answer questions about L'Oreal products, beauty routines, skincare, haircare, makeup, fragrance, beauty ingredient basics, product recommendations, and product usage tips. For any unrelated topic (for example coding, politics, math, history, sports, finance, or general trivia), politely refuse in one short sentence and then redirect the user to ask about L'Oreal beauty products or routines. Keep every response clear, practical, and concise.";

const STORAGE_KEY = "loreal-chatbot-memory-v1";

// Keep the full chat history so each request has context.
const messages = [{ role: "system", content: SYSTEM_PROMPT }];

// Lightweight memory for natural multi-turn conversations.
const conversationState = {
  userName: null,
  pastQuestions: [],
};

function saveConversationMemory() {
  const memoryPayload = {
    messages,
    conversationState,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryPayload));
}

function showWelcomeMessage() {
  appendMessage(
    "assistant",
    "Hello! Ask me about L'Oreal products, routines, or recommendations and I can help."
  );
}

function resetConversationMemory() {
  localStorage.removeItem(STORAGE_KEY);

  messages.length = 0;
  messages.push({ role: "system", content: SYSTEM_PROMPT });

  conversationState.userName = null;
  conversationState.pastQuestions = [];

  chatWindow.innerHTML = "";
  showWelcomeMessage();
  userInput.value = "";
  userInput.focus();
}

function loadConversationMemory() {
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (!savedData) {
    return;
  }

  try {
    const parsedData = JSON.parse(savedData);

    if (Array.isArray(parsedData.messages) && parsedData.messages.length > 0) {
      messages.length = 0;
      parsedData.messages.forEach((message) => {
        if (message && typeof message.role === "string" && typeof message.content === "string") {
          messages.push(message);
        }
      });
    }

    if (parsedData.conversationState && typeof parsedData.conversationState === "object") {
      if (typeof parsedData.conversationState.userName === "string") {
        conversationState.userName = parsedData.conversationState.userName;
      }

      if (Array.isArray(parsedData.conversationState.pastQuestions)) {
        conversationState.pastQuestions = parsedData.conversationState.pastQuestions
          .filter((question) => typeof question === "string")
          .slice(-6);
      }
    }
  } catch (error) {
    console.warn("Could not load saved conversation memory.", error);
  }
}

function renderLatestTurnFromHistory() {
  const recentUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!recentUserMessage) {
    return false;
  }

  const userIndex = messages.lastIndexOf(recentUserMessage);
  const replyAfterUser = messages.slice(userIndex + 1).find((message) => message.role === "assistant");

  chatWindow.innerHTML = "";
  appendMessage("user", recentUserMessage.content);

  if (replyAfterUser) {
    appendMessage("assistant", replyAfterUser.content);
  }

  return true;
}

// Add a message to the chat window.
function appendMessage(role, text) {
  const messageEl = document.createElement("div");
  messageEl.classList.add("msg", role === "user" ? "user" : "ai");

  const speaker = role === "user" ? "You" : "L'Oreal Advisor";
  messageEl.textContent = `${speaker}: ${text}`;

  chatWindow.appendChild(messageEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Reset UI each turn so only the latest question + response are displayed.
function startLatestTurn(question) {
  chatWindow.innerHTML = "";
  appendMessage("user", question);
}

loadConversationMemory();

const hasPreviousConversation = renderLatestTurnFromHistory();

if (!hasPreviousConversation) {
  // Initial welcome message.
  showWelcomeMessage();
}

clearChatBtn.addEventListener("click", () => {
  resetConversationMemory();
});

// Detect a name when the user introduces themselves.
function extractUserName(text) {
  const nameMatch = text.match(/(?:my name is|i am|i'm|call me)\s+([a-zA-Z][a-zA-Z' -]{0,30})/i);

  if (!nameMatch) {
    return null;
  }

  // Keep only simple letters, apostrophes, spaces, and hyphens.
  const cleanedName = nameMatch[1].replace(/[^a-zA-Z' -]/g, "").trim();
  return cleanedName || null;
}

function updateConversationState(question) {
  const detectedName = extractUserName(question);
  if (detectedName) {
    conversationState.userName = detectedName;
  }

  // Track only beauty-relevant questions in a short rolling list.
  if (isBeautyRelatedQuestion(question)) {
    conversationState.pastQuestions.push(question);
    if (conversationState.pastQuestions.length > 6) {
      conversationState.pastQuestions.shift();
    }
  }
}

function buildMemoryContextMessage() {
  const userName = conversationState.userName || "Unknown";
  const pastQuestionsText =
    conversationState.pastQuestions.length > 0
      ? conversationState.pastQuestions.map((q, index) => `${index + 1}. ${q}`).join("\n")
      : "None yet";

  return {
    role: "system",
    content: `Conversation memory:\n- User name: ${userName}\n- Recent beauty questions:\n${pastQuestionsText}\nUse this memory to keep responses consistent and natural.`,
  };
}

// Send the messages array to Cloudflare Worker.
async function getChatbotReply() {
  const messagesWithMemory = [messages[0], buildMemoryContextMessage(), ...messages.slice(1)];

  const response = await fetch("https://loreal-chatbot-worker.folusomololuwa.workers.dev/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: messagesWithMemory,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to reach OpenAI API.");
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;
  return reply;
}

// Basic local topic gate so off-topic questions are refused consistently.
function isBeautyRelatedQuestion(text) {
  const allowedKeywords = [
    "loreal",
    "l'oreal",
    "product",
    "routine",
    "skincare",
    "haircare",
    "makeup",
    "fragrance",
    "beauty",
    "serum",
    "cleanser",
    "moisturizer",
    "sunscreen",
    "spf",
    "foundation",
    "concealer",
    "mascara",
    "lipstick",
    "shampoo",
    "conditioner",
    "hair",
    "skin",
    "acne",
    "dry skin",
    "oily skin",
    "sensitive skin",
    "anti-aging",
    "hyperpigmentation",
    "ingredients",
  ];

  const lowerText = text.toLowerCase();
  return allowedKeywords.some((keyword) => lowerText.includes(keyword));
}

// Allow short follow-up replies when the previous assistant message was beauty-related.
function isContextualBeautyFollowUp(text) {
  const normalized = text.toLowerCase().trim();

  const followUpPhrases = [
    "yes",
    "yeah",
    "yep",
    "sure",
    "ok",
    "okay",
    "please",
    "go ahead",
    "sounds good",
    "that sounds good",
    "i'd love that",
    "id love that",
    "let's do it",
    "lets do it",
    "tell me more",
    "more",
  ];

  const isShortFollowUp = followUpPhrases.some((phrase) => normalized === phrase || normalized.includes(phrase));
  if (!isShortFollowUp) {
    return false;
  }

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (!lastAssistantMessage) {
    return false;
  }

  const assistantText = lastAssistantMessage.content.toLowerCase();
  const beautyContextKeywords = [
    "l'oreal",
    "loreal",
    "routine",
    "recommend",
    "recommendation",
    "product",
    "skincare",
    "haircare",
    "makeup",
    "fragrance",
    "skin type",
    "goals",
  ];

  return beautyContextKeywords.some((keyword) => assistantText.includes(keyword));
}

// Allow short polite social messages without sending them to the API.
function getSmallTalkReply(text) {
  const normalized = text.toLowerCase().trim();

  const gratitudeWords = ["thanks", "thank you", "thx", "ty"];
  const greetingWords = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
  const goodbyeWords = ["bye", "goodbye", "see you", "talk later"];

  if (gratitudeWords.some((word) => normalized.includes(word))) {
    return "You're welcome. If you'd like, I can suggest a L'Oreal routine for your skin type or goals.";
  }

  if (greetingWords.some((word) => normalized.includes(word))) {
    if (conversationState.userName) {
      return `Hi ${conversationState.userName}! I can help with L'Oreal products, routines, and beauty recommendations. What are your skin, hair, or makeup goals?`;
    }

    return "Hi! I can help with L'Oreal products, routines, and beauty recommendations. What are your skin, hair, or makeup goals?";
  }

  if (goodbyeWords.some((word) => normalized.includes(word))) {
    return "Goodbye! Come back anytime for L'Oreal product and routine recommendations.";
  }

  return null;
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question) {
    return;
  }

  // Show only the latest user question in the chat window.
  startLatestTurn(question);
  messages.push({ role: "user", content: question });
  updateConversationState(question);
  saveConversationMemory();

  const detectedName = extractUserName(question);
  if (detectedName && !isBeautyRelatedQuestion(question)) {
    const nameReply = `Nice to meet you, ${detectedName}. I can help with L'Oreal products, routines, and beauty recommendations whenever you're ready.`;
    appendMessage("assistant", nameReply);
    messages.push({ role: "assistant", content: nameReply });
    saveConversationMemory();
    userInput.value = "";
    userInput.focus();
    return;
  }

  const smallTalkReply = getSmallTalkReply(question);
  if (smallTalkReply) {
    appendMessage("assistant", smallTalkReply);
    messages.push({ role: "assistant", content: smallTalkReply });
    saveConversationMemory();
    userInput.value = "";
    userInput.focus();
    return;
  }

  const isFollowUpMessage = isContextualBeautyFollowUp(question);
  if (isFollowUpMessage) {
    conversationState.pastQuestions.push(question);
    if (conversationState.pastQuestions.length > 6) {
      conversationState.pastQuestions.shift();
    }
    saveConversationMemory();
  }

  if (!isBeautyRelatedQuestion(question) && !isFollowUpMessage) {
    appendMessage(
      "assistant",
      "I can only help with L'Oreal products, routines, and beauty-related recommendations. Please ask me a L'Oreal beauty question."
    );
    messages.push({
      role: "assistant",
      content:
        "I can only help with L'Oreal products, routines, and beauty-related recommendations. Please ask me a L'Oreal beauty question.",
    });
    saveConversationMemory();
    userInput.value = "";
    userInput.focus();
    return;
  }

  // Clear input and prevent duplicate submits while waiting.
  userInput.value = "";
  userInput.disabled = true;

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;

  try {
    const reply = await getChatbotReply();
    appendMessage("assistant", reply);
    messages.push({ role: "assistant", content: reply });
    saveConversationMemory();
  } catch (error) {
    appendMessage(
      "assistant",
      "Sorry, I could not get a response right now. Please try again in a moment."
    );
    console.error(error);
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});
