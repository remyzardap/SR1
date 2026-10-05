# Sutaeru UI/UX redesign — local draft

Status: DRAFT ONLY. No push, deploy, production edits, or database changes.
Branch: `draft/sutaeru-ui-ux-2026-10-03`

## Direction: Calm, capable workspace
Use the existing warm ivory, charcoal and restrained orange visual identity. Reduce competing panels, increase content hierarchy, and emphasize the user's current task over decorative chrome.

## Navigation
- Group primary tasks: Chat, Atelier, Images, Files.
- Group personal intelligence: Memories, Skills, Monitors.
- Group account tools: Connections, Identity, Settings.
- Keep new chat and command search prominent; preserve existing routes and permissions.
- On mobile use a simple drawer with clear close, active item, and generous tap targets.

## Chat
- Make the conversation the dominant surface, with a readable max width and responsive composer.
- Show run progress contextually while processing; collapse idle status into a subtle indicator.
- Move model, mode and tool settings into one discoverable settings surface.
- Keep conversation history and detailed agent steps optional rather than permanently competing with the conversation.
- Preserve streaming, retry, attachments, exports and session switching.

## Atelier and other pages
- Standardize page headers, primary actions, empty states, loading and error states.
- Use consistent spacing, typography, border radius and focus indicators.
- Favor concise explanatory copy and progressive disclosure for advanced settings.

## Responsive and accessibility acceptance
- Support 320px mobile widths without horizontal overflow.
- Minimum 44px touch targets for primary actions; visible keyboard focus.
- Respect reduced motion; ensure text contrast and accessible labels.
- Verify light and dark themes and navigation keyboard behavior.

## Implementation guardrails
- Review existing local modifications before changing any shared file.
- Build mockups and code prototypes separately under `design-drafts/` before integration.
- Run type checking and visual review on drafts before proposing integration.
- Do not commit, push, deploy, restart services, or modify live application state without approval.
