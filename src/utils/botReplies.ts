
type ReplyContact = {
  name?: string;
};

export function getSimulatedReply(
  contact: ReplyContact,
  message: string
): string {
  const text = message.trim().toLowerCase();
  const name = contact.name?.trim() || "there";

  if (!text) {
    return "Hey! Send me a message.";
  }

  if (/\b(hi|hello|hey|hii|hlo)\b/.test(text)) {
    return `Hey ${name}! 👋 How are you?`;
  }

  if (/\b(how are you|how r u|how are u)\b/.test(text)) {
    return "I'm doing well! 😊 How about you?";
  }

  if (/\b(good morning)\b/.test(text)) {
    return "Good morning! ☀️ Have a great day!";
  }

  if (/\b(good night|gn)\b/.test(text)) {
    return "Good night! 🌙 Sleep well.";
  }

  if (/\b(thank you|thanks|thx)\b/.test(text)) {
    return "You're welcome! 😊";
  }

  if (/\b(bye|goodbye|see you)\b/.test(text)) {
    return "See you later! 👋";
  }

  if (/\b(love you|i love you)\b/.test(text)) {
    return "Aww, that's sweet! ❤️";
  }

  if (text.includes("?")) {
    return "That's a good question! Tell me a little more. 😊";
  }

  const replies = [
    "Nice! 😊 Tell me more.",
    "Oh, really? 👀",
    "Got it! 👍",
    "That's interesting!",
    "Haha 😄",
    "Okay! Let me know more.",
  ];

  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  return replies[Math.abs(hash) % replies.length];
}
