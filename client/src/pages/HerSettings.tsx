import { useState } from "react";
import { GlassCard, GradientText, PrimaryButton } from "@/components/DashboardLayout";
import { useIntelligence } from "@/_core/hooks/useSutaeruIntelligence";

const colors = {
  blue: '#5B8DEF',
  purple: '#8B5CF6',
  pink: '#FF6B9D',
  green: '#10B981',
  textWhite: '#FFFFFF',
  textGray: '#9CA3AF',
  glassBorder: 'rgba(91, 141, 239, 0.2)',
};

export default function HerSettings() {
  const { her, updateHerSettings, callHistory, isInHerHours } = useIntelligence();
  const [localSettings, setLocalSettings] = useState(her);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateHerSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const personalityOptions = [
    { id: 'warm', label: 'Warm', desc: 'Soft, intimate, caring — like a close friend', icon: '♥' },
    { id: 'professional', label: 'Professional', desc: 'Clear, efficient, polite', icon: '◆' },
    { id: 'mysterious', label: 'Mysterious', desc: 'Alluring, enigmatic, intriguing', icon: '✦' },
    { id: 'playful', label: 'Playful', desc: 'Light, teasing, fun', icon: '☀' },
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          <GradientText>HER Settings</GradientText>
        </h1>
        <p style={{ color: colors.textGray }}>
          Configure your AI assistant's personality and behavior.
        </p>
      </div>

      {/* Status Card */}
      <GlassCard style={{ marginBottom: '24px', background: `linear-gradient(135deg, rgba(255, 107, 157, 0.1), rgba(139, 92, 246, 0.1))` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${colors.pink}, ${colors.purple})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              animation: 'pulse 2s infinite',
            }}
          >
            ♥
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: colors.textWhite, marginBottom: '4px' }}>
              HER is {localSettings.enabled ? 'Active' : 'Disabled'}
            </h3>
            <p style={{ fontSize: '14px', color: colors.textGray }}>
              {localSettings.enabled 
                ? `Personality: ${localSettings.style} • ${isInHerHours ? 'In HER hours' : 'Outside HER hours'}`
                : 'Enable HER to have an AI assistant answer calls for you'
              }
            </p>
          </div>
          <div
            style={{
              width: '44px',
              height: '24px',
              background: localSettings.enabled ? colors.pink : 'rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setLocalSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                background: colors.textWhite,
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: localSettings.enabled ? '22px' : '2px',
                transition: 'all 0.2s',
              }}
            />
          </div>
        </div>
      </GlassCard>

      {/* Personality Selection */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: colors.textWhite }}>
          Personality Style
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {personalityOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setLocalSettings(prev => ({ ...prev, style: option.id as any }))}
              style={{
                padding: '16px',
                background: localSettings.style === option.id ? 'rgba(255, 107, 157, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${localSettings.style === option.id ? colors.pink : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '24px' }}>{option.icon}</span>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  color: localSettings.style === option.id ? colors.pink : colors.textWhite 
                }}>
                  {option.label}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: colors.textGray }}>
                {option.desc}
              </p>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Voice Settings */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: colors.textWhite }}>
          Voice Settings
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', color: colors.textWhite, marginBottom: '4px' }}>
                Enable Voice
              </div>
              <div style={{ fontSize: '12px', color: colors.textGray }}>
                HER will speak using AI-generated voice
              </div>
            </div>
            <div
              style={{
                width: '44px',
                height: '24px',
                background: localSettings.voiceEnabled ? colors.pink : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
              }}
              onClick={() => setLocalSettings(prev => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  background: colors.textWhite,
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: localSettings.voiceEnabled ? '22px' : '2px',
                  transition: 'all 0.2s',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', color: colors.textWhite, marginBottom: '4px' }}>
                Auto-Answer Calls
              </div>
              <div style={{ fontSize: '12px', color: colors.textGray }}>
                HER answers immediately instead of ringing
              </div>
            </div>
            <div
              style={{
                width: '44px',
                height: '24px',
                background: localSettings.autoAnswerCalls ? colors.pink : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                position: 'relative',
                cursor: 'pointer',
              }}
              onClick={() => setLocalSettings(prev => ({ ...prev, autoAnswerCalls: !prev.autoAnswerCalls }))}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  background: colors.textWhite,
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: localSettings.autoAnswerCalls ? '22px' : '2px',
                  transition: 'all 0.2s',
                }}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* HER Hours */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: colors.textWhite }}>
          HER Hours
        </h3>
        <p style={{ fontSize: '13px', color: colors.textGray, marginBottom: '16px' }}>
          HER will automatically answer calls during these hours (outside hours, calls will ring normally)
        </p>
        
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textGray, marginBottom: '8px' }}>
              Start Time
            </label>
            <select
              value={localSettings.herHoursStart}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, herHoursStart: parseInt(e.target.value) }))}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${colors.glassBorder}`,
                borderRadius: '10px',
                color: colors.textWhite,
                fontSize: '14px',
                minWidth: '120px',
              }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i} style={{ background: '#1a1f2e' }}>
                  {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                </option>
              ))}
            </select>
          </div>
          
          <span style={{ color: colors.textGray }}>to</span>
          
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: colors.textGray, marginBottom: '8px' }}>
              End Time
            </label>
            <select
              value={localSettings.herHoursEnd}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, herHoursEnd: parseInt(e.target.value) }))}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${colors.glassBorder}`,
                borderRadius: '10px',
                color: colors.textWhite,
                fontSize: '14px',
                minWidth: '120px',
              }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i} style={{ background: '#1a1f2e' }}>
                  {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Custom Instructions */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: colors.textWhite }}>
          Custom Instructions
        </h3>
        <p style={{ fontSize: '13px', color: colors.textGray, marginBottom: '16px' }}>
          Add specific instructions for how HER should handle calls (e.g., "Never interrupt me during meetings", "Always offer to schedule a callback")
        </p>
        <textarea
          value={localSettings.customInstructions || ''}
          onChange={(e) => setLocalSettings(prev => ({ ...prev, customInstructions: e.target.value }))}
          placeholder="Enter custom instructions for HER..."
          rows={4}
          style={{
            width: '100%',
            padding: '16px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: '12px',
            color: colors.textWhite,
            fontSize: '14px',
            resize: 'none',
          }}
        />
      </GlassCard>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        {saved && (
          <span style={{ color: colors.green, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✓ Saved successfully
          </span>
        )}
        <PrimaryButton onClick={handleSave}>
          Save Changes
        </PrimaryButton>
      </div>

      {/* Call History */}
      {callHistory.length > 0 && (
        <GlassCard style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: colors.textWhite }}>
            Recent Call History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {callHistory.slice(0, 5).map((call) => (
              <div
                key={call.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>☎</span>
                  <div>
                    <div style={{ fontSize: '14px', color: colors.textWhite }}>
                      Call from {call.callerId}
                    </div>
                    <div style={{ fontSize: '12px', color: colors.textGray }}>
                      {call.startedAt.toLocaleString()}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    padding: '4px 12px',
                    background: call.status === 'ended' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(91, 141, 239, 0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: call.status === 'ended' ? colors.green : colors.blue,
                  }}
                >
                  {call.status}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
