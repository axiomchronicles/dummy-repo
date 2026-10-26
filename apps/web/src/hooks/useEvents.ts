import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type EventRecord } from '../api';

export function useEvents(campaignId: string | undefined) {
  const client = useQueryClient();
  const [state, setState] = useState<
    'connecting' | 'connected' | 'reconnecting'
  >('connecting');
  const [events, setEvents] = useState<EventRecord[]>([]);
  useEffect(() => {
    if (!campaignId) return;
    setEvents([]);
    const key = `outreach-event-cursor:${campaignId}`;
    const cursor = sessionStorage.getItem(key) || '0';
    const source = new EventSource(
      `/api/v1/campaigns/${campaignId}/stream?after=${encodeURIComponent(cursor)}`,
      { withCredentials: true },
    );
    source.onopen = () => setState('connected');
    source.onerror = () => setState('reconnecting');
    const receive = (event: MessageEvent) => {
      try {
        const record = JSON.parse(event.data) as EventRecord;
        const id = event.lastEventId || record.id;
        if (id) sessionStorage.setItem(key, id);
        setEvents((previous) =>
          previous.some((item) => item.id === record.id)
            ? previous
            : [...previous, record].slice(-100),
        );
        void client.invalidateQueries({ queryKey: ['campaign', campaignId] });
        void client.invalidateQueries({
          queryKey: ['campaign-contacts', campaignId],
        });
        void client.invalidateQueries({ queryKey: ['reports'] });
        void client.invalidateQueries({ queryKey: ['overview'] });
      } catch {
        setState('reconnecting');
      }
    };
    source.onmessage = receive;
    source.addEventListener('campaign', receive as EventListener);
    source.addEventListener('domain', receive as EventListener);
    return () => source.close();
  }, [campaignId, client]);
  return { state, events };
}
