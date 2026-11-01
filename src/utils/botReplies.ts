import { Contact } from '../types/chat';

export function getSimulatedReply(contact: Contact, userMessage: string): string {
  const lower = userMessage.toLowerCase();

  // If chatting with ZOLO AI Bot
  if (contact.id === 'c5') {
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return "Hello there! 👋 How can I help you today on ZOLO? Ask me anything or let me know what you'd like to explore!";
    }
    if (lower.includes('who are you') || lower.includes('what is this') || lower.includes('zolo') || lower.includes('skaarchat')) {
      return "I'm ZOLO AI Bot! 🤖 ZOLO is your all-in-one messaging platform equipped with end-to-end encryption, voice notes with speed toggles, interactive polls, audio/video calling, and status stories!";
    }
    if (lower.includes('help') || lower.includes('features')) {
      return "Here are some cool things you can try in ZOLO:\n• Record a voice note by clicking the Mic button\n• Create a poll via the paperclip icon\n• Start an Audio or Video call in the header\n• Share a Status story in the Status tab\n• React to messages with emojis!";
    }
    if (lower.includes('joke')) {
      return "Why do programmers prefer dark mode? Because light attracts bugs! 😄🐛";
    }
    return `That's an interesting point about "${userMessage.slice(0, 35)}..."! Let me know if you want me to expand on that or generate some creative ideas for you! 🚀`;
  }

  // Sarah Miller (Design Lead)
  if (contact.id === 'c1') {
    if (lower.includes('call') || lower.includes('video') || lower.includes('audio')) {
      return "I'm ready! Tap the call button at the top whenever you want to test the connection. 📞";
    }
    if (lower.includes('look') || lower.includes('design') || lower.includes('ui') || lower.includes('component')) {
      return "I love the clean aesthetic! The emerald accent really brings the WhatsApp heritage to life while feeling brand new.";
    }
    return "Sounds great! Let's align on this in our next design sync. Keep me posted on any updates!";
  }

  // Alex Chen (Full Stack Dev)
  if (contact.id === 'c3') {
    if (lower.includes('coffee') || lower.includes('café') || lower.includes('meet')) {
      return "I just ordered a flat white here! Grab a table if you're nearby ☕";
    }
    if (lower.includes('audio') || lower.includes('code') || lower.includes('synthesizer') || lower.includes('bug')) {
      return "Everything compiled smoothly on my end! The Web Audio synthesizer approach is so reliable for instant sound feedback.";
    }
    return "Nice! Pushing my branch right now. Let me know when you want to review the pull request.";
  }

  // Elena Rostova (Product Manager)
  if (contact.id === 'c4') {
    if (lower.includes('meeting') || lower.includes('burndown') || lower.includes('roadmap')) {
      return "Great! The metrics look fantastic for this cycle. Stakeholders will be thrilled with the speed of ZOLO.";
    }
    return "Thanks for the update! Adding this note to our sprint board.";
  }

  // Default fallback for any custom added contact
  return `Thanks for your message! Got it: "${userMessage}". Will get back to you shortly!`;
}
