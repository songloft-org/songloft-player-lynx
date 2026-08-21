import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import './PlaylistFormFields.css'

export interface PlaylistFormFieldsProps {
  name: string
  onNameChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
}

/**
 * The name / description field pair shared by the create and edit playlist
 * forms — the third copy of this markup would otherwise live in a page that
 * already carries four render modes.
 */
export function PlaylistFormFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
}: PlaylistFormFieldsProps) {
  const { t } = useTranslation()

  return (
    <view>
      <text className='playlist-form__label'>{t('playlist.namePlaceholder')}</text>
      <Input
        className='playlist-form__input'
        value={name}
        onInput={onNameChange}
        placeholder={t('playlist.namePlaceholder')}
      />

      <text className='playlist-form__label'>{t('playlist.descriptionPlaceholder')}</text>
      <Input
        className='playlist-form__input'
        value={description}
        onInput={onDescriptionChange}
        placeholder={t('playlist.descriptionPlaceholder')}
      />
    </view>
  )
}
