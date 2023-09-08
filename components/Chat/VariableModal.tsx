import { FC, KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Prompt } from '@/types/prompt';

interface Props {
  prompt: Prompt;
  variables: string[];
  onSubmit: (updatedVariables: string[]) => void;
  onClose: () => void;
}

export const VariableModal: FC<Props> = ({
  prompt,
  variables,
  onSubmit,
  onClose,
}) => {
  const [updatedVariables, setUpdatedVariables] = useState<
    { key: string; value: string }[]
  >(
    variables
      .map((variable) => ({ key: variable, value: '' }))
      .filter(
        (item, index, array) =>
          array.findIndex((t) => t.key === item.key) === index,
      ),
  );

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (index: number, value: string) => {
    setUpdatedVariables((prev) => {
      const updated = [...prev];
      updated[index].value = value;
      return updated;
    });
  };

  const handleSubmit = () => {
    if (updatedVariables.some((variable) => variable.value === '')) {
      alert('Please fill out all variables');
      return;
    }

    onSubmit(updatedVariables.map((variable) => variable.value));
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('click', handleOutsideClick);

    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [onClose]);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalRef}
        className="dark:border-gray-600 inline-block max-h-[400px] transform overflow-y-auto rounded-lg border border-gray-300 bg-white px-4 pt-5 pb-4 text-left align-bottom shadow-xl transition-all dark:bg-[#2b323f] sm:my-8 sm:max-h-[600px] sm:w-full sm:max-w-lg sm:p-6 sm:align-middle"
        role="dialog"
      >
        <div className="mb-4 text-2xl font-bold text-black dark:text-gray-200">
          {prompt.name}
        </div>

        <div className="mb-6 border-b dark:border-gray-600 border-gray-200 pb-4 text-sm italic text-black dark:text-gray-200">
          {prompt.description}
        </div>

        {updatedVariables.map((variable, index) => (
          <div className="mb-4" key={index}>
            <div className="mb-2 text-sm font-bold text-gray-200">
              {variable.key}
            </div>
            <textarea
              ref={index === 0 ? nameInputRef : undefined}
              className="mt-1 w-full rounded-lg border border-gray-500 px-4 py-2 text-gray-900 shadow focus:outline-none dark:border-gray-800 dark:border-opacity-50 dark:bg-gray-700 dark:text-gray-100"
              style={{ resize: 'none' }}
              placeholder={`Enter a value for ${variable.key}...`}
              value={variable.value}
              onChange={(e) => handleChange(index, e.target.value)}
              rows={3}
            />
          </div>
        ))}

        <button
          className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2 text-white shadow hover:bg-brand-700"
          onClick={handleSubmit}
        >
          Submit
        </button>
      </div>
    </div>
  );
};
