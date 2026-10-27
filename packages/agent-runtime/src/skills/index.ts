export interface RuntimeSkill {
  name: string;
  description: string;
  instructions: string;
}

export const outreachPlanningSkill: RuntimeSkill = {
  name: 'outreach-planning',
  description: 'Techniques for synthesizing coherent, unambiguous outreach campaigns from user instructions',
  instructions: `
When drafting an outreach campaign:
1. Identify the core calling purpose (e.g. interview invitation, document verification, event confirmation).
2. Explicitly extract dates, times, and venue requirements from user text or attachments. Never hallucinate or assume dates.
3. If essential parameters are ambiguous, formulate clear, single-question clarifications.
4. Structure the conversation into 4 standard stages: Identity Verification, Primary Announcement, Response Inquiry, and Closing.
5. Remind the user that the plan is a draft and requires confirmation in the confirmation drawer before execution.
`,
};

export const callPolicySkill: RuntimeSkill = {
  name: 'call-policy-and-disclosure',
  description: 'Regulatory requirements for automated outreach telephony and consent compliance',
  instructions: `
Ensure every voice agent call conforms to ethical outreach principles:
1. Always include an upfront automated identity disclosure: "This is an automated call from Outreach Intern on behalf of [Company]..."
2. Respect consumer opt-out phrases: If a contact says "stop calling", "do not call", or "wrong number", immediately terminate and record suppression.
3. Restrict dialing to configured legal calling windows (10:00 to 18:00 in the target timezone).
4. Never make unsubstantiated claims regarding job offers, test results, or legal obligations.
`,
};

export const postCallAnalysisSkill: RuntimeSkill = {
  name: 'post-call-analysis',
  description: 'Rules for objective call disposition categorization without hallucination',
  instructions: `
When analyzing call transcripts:
1. Classify the contact's final answer strictly: 'confirmed', 'declined', 'reschedule_requested', 'wrong_number', or 'unknown'.
2. If the user's speech is ambiguous, muffled, or unconfirmed, mark the outcome as 'unknown'.
3. Do not invent commitments or promises that are not present in the transcript turns.
4. Highlight follow-up requirements if the user requested a different callback time or had questions.
`,
};
