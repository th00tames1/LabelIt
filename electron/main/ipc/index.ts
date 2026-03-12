import { registerProjectIpc } from './project.ipc'
import { registerImageIpc } from './image.ipc'
import { registerAnnotationIpc } from './annotation.ipc'
import { registerLabelIpc } from './label.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerExportIpc } from './export.ipc'
import { registerYoloIpc } from './yolo.ipc'
import { registerFinishIpc } from './finish.ipc'

export function registerAllIpc(): void {
  registerProjectIpc()
  registerImageIpc()
  registerAnnotationIpc()
  registerLabelIpc()
  registerSettingsIpc()
  registerExportIpc()
  registerYoloIpc()
  registerFinishIpc()
}
