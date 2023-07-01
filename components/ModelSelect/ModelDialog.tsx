import { FC, useContext, useEffect, useRef } from 'react';

import { useTranslation } from 'next-i18next';

import { Models } from '@/utils/config/models';

import HomeContext from '@/pages/api/home/home.context';

import { Dialog } from '../Dialog';
import { Key } from './Key';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ModelDialog: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation('model');
  const {
    dispatch: homeDispatch,
    state: { model },
  } = useContext(HomeContext);

  return (
    <Dialog onClose={onClose} open={open}>
      <div className="text-lg pb-4 font-bold text-black dark:text-neutral-200">
        {t('Choose from available models')}
      </div>
      <div className="space-y-2">
        <div>
          <div className="text-sm font-bold mb-2 text-black dark:text-neutral-200">
            {t('Model')}
          </div>
          <select
            className="w-full cursor-pointer bg-transparent p-2 text-neutral-700 dark:text-neutral-200 "
            value={model}
            onChange={(event) =>
              homeDispatch({ field: 'model', value: event.target.value })
            }
          >
            {Models.map((model) => (
              <option key={model.name} value={model.name}>
                {t(model.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-sm font-bold mb-2 text-black dark:text-neutral-200">
            {t('Key')}
          </div>
          <Key />
        </div>
      </div>
      <button
        type="button"
        className="w-full px-4 py-2 mt-6 border rounded-lg shadow border-neutral-500 text-neutral-900 hover:bg-neutral-100 focus:outline-none dark:border-neutral-800 dark:border-opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-300"
        onClick={() => {
          onClose();
        }}
      >
        {t('Done')}
      </button>
    </Dialog>
  );
};
