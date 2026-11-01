import {
  getDueScheduledMessages,
  markScheduledMessageSent,
  type ScheduledMessage,
} from './workspaceRepository.ts';
import { saveDirectMessage } from '../db/messagingRepository.ts';
import { realtimeHub } from './realtimeHub.ts';

let schedulerInterval: NodeJS.Timeout | null = null;

export function startSchedulerRunner(): void {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(async () => {
    try {
      const due = await getDueScheduledMessages();
      if (due.length === 0) return;

      for (const msg of due) {
        try {
          let payload = {};
          if (msg.payloadJson) {
            try {
              payload = JSON.parse(msg.payloadJson);
            } catch {}
          }

          const recipientOnline = realtimeHub.isPhoneOnline(msg.recipientPhone);
          const initialStatus = recipientOnline ? 'delivered' : 'sent';

          const saved = await saveDirectMessage({
            messageId: msg.scheduleId,
            senderPhone: msg.senderPhone,
            senderName: 'Scheduled Message',
            senderAvatar: null,
            recipientPhone: msg.recipientPhone,
            text: msg.text,
            mediaType: (msg.mediaType as any) || 'text',
            payload,
            initialStatus,
          });

          await markScheduledMessageSent(msg.scheduleId);

          const senderProfile = {
            uid: `usr_${msg.senderPhone.replace(/\D/g, '')}`,
            phoneNormalized: msg.senderPhone,
            fullName: 'Scheduled Message',
            about: 'Scheduled delivery',
            avatarUrl: null,
          };

          // Broadcast to recipient and sender
          realtimeHub.sendToPhone(msg.recipientPhone, {
            type: 'message:new',
            message: saved,
            senderProfile,
          });
          realtimeHub.sendToPhone(msg.senderPhone, {
            type: 'message:new',
            message: saved,
            senderProfile,
          });
          realtimeHub.sendToPhone(msg.senderPhone, {
            type: 'scheduled:executed',
            scheduleId: msg.scheduleId,
          });
        } catch (err) {
          console.error('Error executing scheduled message:', msg.scheduleId, err);
        }
      }
    } catch (e) {
      // Non-fatal runner cycle error
    }
  }, 5000);
}
