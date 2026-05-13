export default function ConfirmDialog ({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null

  return (
    <div className="daily-dialog-mask" role="presentation" onMouseDown={onCancel}>
      <div className="daily-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-dialog-title"
           onMouseDown={(event) => event.stopPropagation()}>
        <div id="daily-dialog-title" className="daily-dialog-title">{dialog.title}</div>
        {dialog.message && <div className="daily-dialog-message">{dialog.message}</div>}
        <div className="daily-dialog-actions">
          <button onClick={onCancel}>{dialog.cancelText || '取消'}</button>
          <button className="daily-dialog-primary" onClick={onConfirm}>{dialog.confirmText || '确认'}</button>
        </div>
      </div>
    </div>
  )
}
