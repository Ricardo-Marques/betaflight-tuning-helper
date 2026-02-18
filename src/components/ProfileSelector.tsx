import { observer } from 'mobx-react-lite'
import { useAnalysisStore } from '../stores/RootStore'
import { QUAD_SIZE_ORDER, QUAD_PROFILES } from '../domain/profiles/quadProfiles'

export const ProfileSelector = observer(() => {
  const analysisStore = useAnalysisStore()
  const detection = analysisStore.detectionResult

  return (
    <div className="p-4 border-b">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-700">Quad Profile</h3>
        {detection && detection.confidence >= 0.5 && (
          <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
            Auto-detected
          </span>
        )}
        {detection && detection.confidence < 0.5 && (
          <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
            Low confidence
          </span>
        )}
      </div>
      <div className="flex gap-1">
        {QUAD_SIZE_ORDER.map(sizeId => {
          const profile = QUAD_PROFILES[sizeId]
          const isActive = analysisStore.quadProfile.id === sizeId
          return (
            <button
              key={sizeId}
              onClick={() => analysisStore.setQuadProfile(sizeId)}
              title={profile.description}
              className={`flex-1 px-1.5 py-1.5 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {profile.label}
            </button>
          )
        })}
      </div>
      {detection && detection.reasoning.length > 0 && (
        <p className="text-xs text-gray-500 mt-1.5 truncate" title={detection.reasoning.join('; ')}>
          {detection.reasoning[0]}
        </p>
      )}
    </div>
  )
})
