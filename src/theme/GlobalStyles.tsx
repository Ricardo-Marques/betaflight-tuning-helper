import { Global, css, useTheme } from '@emotion/react'

export function GlobalStyles() {
  const theme = useTheme()

  return (
    <Global
      styles={css`
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: ${theme.colors.scrollbar.track};
        }
        ::-webkit-scrollbar-thumb {
          background: ${theme.colors.scrollbar.thumb};
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${theme.colors.scrollbar.thumbHover};
        }

        @keyframes attention-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
          }
          40% {
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
          }
        }

        .attention-pulse {
          animation: attention-pulse 0.7s ease-out;
        }

        @keyframes dim-fade {
          0% { opacity: 1; }
          10% { opacity: 0.35; }
          75% { opacity: 0.35; }
          100% { opacity: 1; }
        }

        .dim-siblings > *:not(.selected-item) {
          animation: dim-fade 1.5s ease-out forwards;
        }
      `}
    />
  )
}
