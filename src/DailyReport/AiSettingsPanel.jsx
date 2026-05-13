import { AI_PROVIDERS, DEFAULT_MODEL_PLACEHOLDER, updateAiProvider } from './aiSettings'

export default function AiSettingsPanel ({ settings, onChange, onSave }) {
  const update = (key, value) => {
    onChange({ ...settings, [key]: value })
  }

  const handleProviderChange = (provider) => {
    onChange(updateAiProvider(settings, provider))
  }

  return (
    <div className="daily-ai-settings">
      <label>
        <span>服务商</span>
        <select
          value={settings.provider}
          onChange={(event) => handleProviderChange(event.target.value)}
        >
          {AI_PROVIDERS.map(provider => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>服务地址</span>
        <input
          value={settings.baseURL}
          onChange={(event) => update('baseURL', event.target.value.trim())}
          placeholder="https://api.openai.com"
        />
      </label>
      <label>
        <span>API Key</span>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(event) => update('apiKey', event.target.value.trim())}
          placeholder="sk-..."
        />
      </label>
      <label>
        <span>模型名</span>
        <input
          value={settings.model}
          onChange={(event) => update('model', event.target.value.trim())}
          placeholder={DEFAULT_MODEL_PLACEHOLDER}
        />
      </label>
      <label>
        <span>随机性</span>
        <input
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          onChange={(event) => update('temperature', event.target.value)}
        />
        <small>控制输出变化程度，0 更稳定，1 更发散；日报/周报建议 0.2 - 0.6。</small>
      </label>
      <label>
        <span>日报优化提示词</span>
        <textarea
          value={settings.dailyPrompt}
          onChange={(event) => update('dailyPrompt', event.target.value)}
        />
      </label>
      <label>
        <span>周报总结提示词</span>
        <textarea
          value={settings.weeklyPrompt}
          onChange={(event) => update('weeklyPrompt', event.target.value)}
        />
      </label>
      <button className="daily-ai-save" onClick={onSave}>保存 AI 设置</button>
    </div>
  )
}
