import { useState, type ChangeEvent } from 'react'
import { clientImportLimit, parseClientCsv, type ClientImportPreview } from './lib/clientImport'
import { db } from './lib/olimline'

type Props = { onImported: () => void }

export default function ClientImport({ onImported }: Props) {
  const [preview, setPreview] = useState<(ClientImportPreview & { fileName: string }) | null>(null)
  const [busy, setBusy] = useState<'read' | 'import' | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<{ added: number; existing: number } | null>(null)

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || busy) return

    setErrorMessage('')
    setPreview(null)
    setResult(null)

    if (file.size > 1024 * 1024) {
      setErrorMessage('Le fichier dépasse 1 Mo. Divisez votre liste en plusieurs fichiers.')
      return
    }

    setBusy('read')
    try {
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      } catch {
        throw new Error('Impossible de lire le fichier. Exportez-le au format CSV UTF-8.')
      }
      setPreview({ fileName: file.name, ...parseClientCsv(text) })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de lire le fichier.')
    } finally {
      setBusy(null)
    }
  }

  async function importClients() {
    if (!preview?.clients.length || busy) return
    setBusy('import')
    setErrorMessage('')

    try {
      const { data, error } = await db().rpc('wo_import_clients', { p_clients: preview.clients })
      if (error || typeof data !== 'number') throw new Error('Import impossible')

      setResult({ added: data, existing: preview.clients.length - data })
      setPreview(null)
      onImported()
    } catch {
      setErrorMessage('L’import a échoué. Réessayez avec le même fichier.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="wo-detail wo-form" aria-labelledby="wo-import-title" aria-busy={Boolean(busy)}>
      <div>
        <p className="wo-eyebrow">PORTEFEUILLE</p>
        <h2 id="wo-import-title">Importer des clients</h2>
        <p className="wo-setup-description">
          Importez un CSV UTF-8 depuis Excel ou Google Sheets, jusqu’à {clientImportLimit} clients par fichier.
          Nom et Email sont requis. Téléphone et Besoins sont facultatifs.
        </p>
      </div>
      <label>
        Liste des clients
        <input type="file" accept=".csv,text/csv" onChange={readFile} disabled={Boolean(busy)} />
      </label>

      {busy === 'read' && <p role="status">Lecture du fichier…</p>}
      {errorMessage && <p className="wo-alert" role="alert">{errorMessage}</p>}
      {result && (
        <p className="wo-success" role="status">
          {result.added} fiche(s) créée(s), {result.existing} adresse(s) déjà présente(s).
          Retrouvez les nouvelles fiches dans le portefeuille clients.
        </p>
      )}

      {preview && (
        <div className="wo-form">
          <p className="wo-setup-description">
            <strong>{preview.fileName}</strong> · {preview.clients.length} fiche(s) prête(s) pour l’import.
            Les adresses déjà présentes dans votre portefeuille seront ignorées.
          </p>
          {preview.ignored.length > 0 && (
            <details className="wo-setup-ignored" open>
              <summary>Fiches ignorées ({preview.ignored.length})</summary>
              <ul>{preview.ignored.map(item => <li key={item}>{item}</li>)}</ul>
            </details>
          )}
          {preview.clients.length > 0 && (
            <>
              <div className="wo-setup-table" role="region" aria-label="Aperçu de l’import" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Nom</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Téléphone</th>
                      <th scope="col">Besoins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.clients.map(client => (
                      <tr key={client.email}>
                        <td>{client.full_name}</td>
                        <td>{client.email}</td>
                        <td>{client.phone || '—'}</td>
                        <td>{client.needs || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="wo-form-actions">
                <button type="button" className="wo-button wo-primary" disabled={Boolean(busy)} onClick={() => void importClients()}>
                  {busy === 'import' ? 'Import en cours…' : 'Confirmer l’import'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
