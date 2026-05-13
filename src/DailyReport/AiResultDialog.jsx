export default function AiResultDialog ({ dialog, onReplace, onCopy, onClose }) {
  if (!dialog) return null

  return (
    <div className="daily-dialog-mask">
      <div className="daily-dialog daily-ai-result-dialog">
        <div className="daily-dialog-title">{dialog.title}</div>
        <textarea readOnly value={dialog.text}/>
        <div className="daily-dialog-actions">
          <button onClick={onClose}>关闭</button>
          <button onClick={onCopy}>复制</button>
          {dialog.canReplace && (
            <button className="daily-dialog-primary" onClick={onReplace}>覆盖原文</button>
          )}
        </div>
      </div>
    </div>
  )
}
